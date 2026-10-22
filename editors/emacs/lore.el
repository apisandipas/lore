;;; lore.el --- Typed project notes, linked to the code they govern  -*- lexical-binding: t; -*-

;; Author: Bryan Paronto
;; URL: https://github.com/apisandipas/lore
;; Version: 0.1.0
;; Package-Requires: ((emacs "29.1"))
;; Keywords: tools, convenience, outlines

;;; Commentary:

;; Emacs front end for the `lore' CLI.  lore keeps a repo's specs,
;; decisions, efforts and CONTEXT.md files as typed Markdown or Org notes,
;; and answers "which notes govern this file?".  This package puts those
;; answers where you are editing:
;;
;; - `lore-sidebar-mode': a side window that follows the selected buffer and
;;   lists the notes governing its file, most relevant first.
;; - `lore-mode' (on in every file of a lore repo with `global-lore-mode'):
;;   M-. on a citation (lore:<id>) or a link ([[name]]) opens the note;
;;   eldoc shows its summary; completion after [[ and lore: offers note
;;   names; Flymake shows `lore check' problems for the file; the mode line
;;   shows how many notes govern it.
;; - Commands for the workflow: `lore-next', `lore-show', `lore-check',
;;   `lore-new', `lore-tick' and `lore-freeze', on `lore-command-map'.
;; - Org: [[lore:<id>]] is a link type.
;;
;; Everything goes through `lore ... --json'; the package keeps no index of
;; its own.  Diagnostics and context reflect the files as saved, since lore
;; reads the disk.
;;
;; Setup:
;;
;;   (require 'lore)
;;   (global-lore-mode 1)
;;   (keymap-global-set "C-c l" lore-command-map)

;;; Code:

(require 'button)
(require 'cl-lib)
(require 'eldoc)
(require 'flymake)
(require 'subr-x)
(require 'seq)
(require 'xref)

(defgroup lore nil
  "Typed project notes, linked to the code they govern."
  :group 'tools
  :prefix "lore-")

(defcustom lore-executable "lore"
  "The lore command."
  :type 'string)

(defcustom lore-sidebar-width 48
  "Width of the `lore-sidebar-mode' window, in columns."
  :type 'natnum)

(defcustom lore-sidebar-full nil
  "When non-nil, the sidebar shows each note's body, not only its summary."
  :type 'boolean)

(defface lore-title '((t :inherit bold))
  "Face for a note's title in lore buffers.")

(defface lore-dim '((t :inherit shadow))
  "Face for secondary text in lore buffers: types, reasons, paths.")

;;;; Running lore

(defun lore-root (&optional dir)
  "The root of the lore repo holding DIR, or nil outside one.
A lore repo is a directory with a .lore/ directory in it."
  (when-let* ((found (locate-dominating-file (or dir default-directory) ".lore")))
    (file-name-as-directory (expand-file-name found))))

(defun lore--parse (buffer)
  "The JSON in BUFFER, or nil when there is none."
  (with-current-buffer buffer
    (goto-char (point-min))
    (ignore-errors
      (json-parse-buffer :object-type 'alist :array-type 'list
                         :null-object nil :false-object nil))))

(defun lore--run (args &optional root)
  "Run lore with ARGS and --json in ROOT, and return the parsed output.
`lore check' exits 1 when it finds problems and still prints JSON, so the
exit code alone is not an error.  Signals `user-error' when lore prints no
JSON at all."
  (let ((default-directory (or root (lore-root) default-directory)))
    (with-temp-buffer
      (let* ((err-file (make-temp-file "lore-err"))
             (code (apply #'process-file lore-executable nil (list t err-file) nil
                          (append args '("--json"))))
             (err (with-temp-buffer
                    (insert-file-contents err-file)
                    (delete-file err-file)
                    (string-trim (buffer-string)))))
        (or (lore--parse (current-buffer))
            ;; Without JSON, lore said why on stdout (a usage or lookup
            ;; error) or on stderr.
            (user-error "%s" (let ((out (string-trim (buffer-string))))
                               (cond ((not (string-empty-p out)) out)
                                     ((not (string-empty-p err)) err)
                                     (t (format "lore %s exited %s" (car args) code))))))))))

(defun lore--run-text (args &optional root)
  "Run lore with ARGS in ROOT, and return its output as text."
  (let ((default-directory (or root (lore-root) default-directory)))
    (with-temp-buffer
      (apply #'process-file lore-executable nil t nil args)
      (buffer-string))))

(defun lore--run-async (args callback &optional root)
  "Run lore with ARGS and --json in ROOT, then call CALLBACK with the result.
CALLBACK gets the parsed JSON, or nil when lore printed none.  Returns
the process."
  (let* ((default-directory (or root (lore-root) default-directory))
         (out (generate-new-buffer " *lore-out*"))
         (err (generate-new-buffer " *lore-err*")))
    (make-process
     :name "lore" :buffer out :stderr err :noquery t
     :connection-type 'pipe
     :command (cons lore-executable (append args '("--json")))
     :sentinel (lambda (proc _event)
                 (unless (process-live-p proc)
                   (let ((data (lore--parse out)))
                     (kill-buffer out)
                     (when (buffer-live-p err) (kill-buffer err))
                     (funcall callback data)))))))

(defun lore--relative (file root)
  "FILE relative to ROOT, with forward slashes."
  (file-relative-name (expand-file-name file) root))

;;;; Notes and names

(defvar lore--names-cache (make-hash-table :test #'equal)
  "Root to (TIME . NOTES), from `lore list'.")

(defun lore--notes (&optional root)
  "Every note in ROOT, from `lore list', cached for a few seconds."
  (let* ((root (or root (lore-root)))
         (hit (gethash root lore--names-cache)))
    (if (and hit (< (- (float-time) (car hit)) 5))
        (cdr hit)
      (let ((notes (lore--run '("list" "--summaries") root)))
        (puthash root (cons (float-time) notes) lore--names-cache)
        notes))))

(defun lore--name (note)
  "The name NOTE, from `lore list', is linked by: type/stem, as lore writes it."
  (or (alist-get 'name note)
      (file-name-sans-extension (file-name-nondirectory (alist-get 'path note)))))

(defun lore--find (ref &optional root)
  "The note REF names in ROOT, from `lore show', or nil when none."
  (condition-case nil
      (lore--run (list "show" ref) root)
    (user-error nil)))

(defun lore--visit (path &optional root other-window)
  "Visit the repo file PATH in ROOT, in another window when OTHER-WINDOW."
  (funcall (if other-window #'find-file-other-window #'find-file)
           (expand-file-name path (or root (lore-root)))))

(defconst lore--ref-regexp
  (concat "lore:\\([[:alnum:]_./-]*[[:alnum:]_/]\\)"
          "\\|\\[\\[\\(?:file:\\)?\\([^]|#\n[]+\\)")
  "A citation in code (group 1) or a [[link]] in a note (group 2).")

(defun lore--ref-at-point ()
  "The citation or link at point, as the name lore resolves, or nil."
  (save-excursion
    (let ((pt (point)) (eol (line-end-position)) found)
      (beginning-of-line)
      (while (and (not found) (re-search-forward lore--ref-regexp eol t))
        (when (<= (match-beginning 0) pt (match-end 0))
          (setq found (string-trim (or (match-string-no-properties 1)
                                       (match-string-no-properties 2))))))
      (and found (not (string-match-p "\\`[a-z][[:alnum:]+.-]*:" found))
           found))))

;;;; Context sidebar

(defconst lore--sidebar-name "*lore*")

(defvar lore--sidebar-file nil
  "The file the sidebar last showed, so switching back does not refetch.")

(defvar-local lore--note-count nil
  "How many notes govern this buffer's file.
Nil until `lore-mode' or the sidebar has asked lore.")

(defun lore--insert-note (note root)
  "Insert NOTE, an alist from `lore context' in ROOT, with its details.
The title is a button that visits the note."
  (let ((path (alist-get 'path note)))
    (insert-text-button (alist-get 'title note)
                        'face 'lore-title 'follow-link t
                        'help-echo path
                        'action (lambda (_) (lore--visit path root t)))
    (let ((type (alist-get 'type note)) (status (alist-get 'status note)))
      (when type
        (insert (propertize (format "  %s%s" type (if status (format ", %s" status) ""))
                            'face 'lore-dim))))
    (insert "\n")
    (insert (propertize (format "  %s\n" (string-join (alist-get 'matched note) "; "))
                        'face 'lore-dim))
    (when-let* ((summary (alist-get 'summary note)) ((not (string-empty-p summary))))
      (let ((start (point)) (fill-prefix "  ") (fill-column (- lore-sidebar-width 2)))
        (insert "  " summary "\n")
        (fill-region start (point))))
    (when-let* ((body (alist-get 'body note)))
      (insert "\n" (replace-regexp-in-string "^" "    " body) "\n"))
    (insert "\n")))

(defun lore--render-context (file data root)
  "Fill the sidebar with DATA, the result of `lore context' on FILE."
  (with-current-buffer (get-buffer-create lore--sidebar-name)
    (let ((inhibit-read-only t) (notes (alist-get 'notes data)))
      (erase-buffer)
      (lore-sidebar-buffer-mode)
      (insert (propertize (lore--relative file root) 'face 'lore-dim) "\n"
              (propertize (pcase (length notes)
                            (0 "no notes")
                            (1 "1 note")
                            (n (format "%d notes" n)))
                          'face 'lore-dim)
              "\n\n")
      (dolist (note notes) (lore--insert-note note root))
      (goto-char (point-min)))))

(define-derived-mode lore-sidebar-buffer-mode special-mode "lore"
  "Major mode for the lore sidebar.  RET or a click on a title opens it."
  (setq-local truncate-lines nil)
  (setq-local word-wrap t))

(defun lore--context (buffer callback)
  "Ask lore which notes govern BUFFER's file, then call CALLBACK.
CALLBACK gets the file, the parsed `lore context' result and the root.
Does nothing for a buffer with no file, or a file outside a lore repo."
  (when-let* ((file (buffer-file-name buffer))
              (root (lore-root (file-name-directory file))))
    (lore--run-async
     (append (list "context" (lore--relative file root))
             (and lore-sidebar-full '("--full")))
     (lambda (data)
       (when (buffer-live-p buffer)
         (with-current-buffer buffer
           (setq lore--note-count (length (alist-get 'notes data)))
           (force-mode-line-update)))
       (funcall callback file data root))
     root)))

(defun lore-refresh (&optional force)
  "Show the notes for the selected window's file in the sidebar.
Skips a file the sidebar already shows unless FORCE."
  (interactive (list t))
  (let ((buffer (window-buffer (selected-window))))
    (when-let* ((file (buffer-file-name buffer))
                ((or force (not (equal file lore--sidebar-file))))
                ((lore-root (file-name-directory file))))
      (setq lore--sidebar-file file)
      (lore--context buffer
                     (lambda (file data root)
                       (when (equal file lore--sidebar-file)
                         (lore--render-context file data root)))))))

(defvar lore--refresh-timer nil)

(defun lore--schedule-refresh (&rest _)
  "Refresh the sidebar once Emacs is idle, when it is showing."
  (when (get-buffer-window lore--sidebar-name t)
    (when (timerp lore--refresh-timer) (cancel-timer lore--refresh-timer))
    (setq lore--refresh-timer (run-with-idle-timer 0.2 nil #'lore-refresh))))

(defun lore--refresh-after-save ()
  "A saved note can change what governs any file; refetch."
  (setq lore--sidebar-file nil)
  (lore--schedule-refresh))

;;;###autoload
(define-minor-mode lore-sidebar-mode
  "Show the notes governing the selected file in a side window.
The window follows the selected buffer, and refreshes after a save."
  :global t
  (if lore-sidebar-mode
      (progn
        (add-hook 'window-selection-change-functions #'lore--schedule-refresh)
        (add-hook 'window-buffer-change-functions #'lore--schedule-refresh)
        (add-hook 'after-save-hook #'lore--refresh-after-save)
        (display-buffer-in-side-window
         (get-buffer-create lore--sidebar-name)
         `((side . right) (slot . 0) (window-width . ,lore-sidebar-width)
           (preserve-size . (t . nil))
           (window-parameters . ((no-delete-other-windows . t)))))
        (setq lore--sidebar-file nil)
        (lore-refresh))
    (remove-hook 'window-selection-change-functions #'lore--schedule-refresh)
    (remove-hook 'window-buffer-change-functions #'lore--schedule-refresh)
    (remove-hook 'after-save-hook #'lore--refresh-after-save)
    (when-let* ((window (get-buffer-window lore--sidebar-name t)))
      (delete-window window))))

;;;; xref: M-. on a citation or a link

(defun lore--xref-backend ()
  "The lore xref backend, only when point is on a citation or link.
Anywhere else \\[xref-find-definitions] falls through to the next backend,
such as eglot or etags."
  (and (lore-root) (lore--ref-at-point) 'lore))

(cl-defmethod xref-backend-identifier-at-point ((_backend (eql lore)))
  "The citation or link at point."
  (lore--ref-at-point))

(cl-defmethod xref-backend-definitions ((_backend (eql lore)) ref)
  "The note REF names."
  (when-let* ((root (lore-root)) (note (lore--find ref root)))
    (list (xref-make (alist-get 'title note)
                     (xref-make-file-location
                      (expand-file-name (alist-get 'path note) root) 1 0)))))

(cl-defmethod xref-backend-references ((_backend (eql lore)) ref)
  "Code that cites the note REF, and notes that link to it."
  (when-let* ((root (lore-root)) (note (lore--find ref root)))
    (append
     (mapcar (lambda (c)
               (xref-make (format "cites %s" ref)
                          (xref-make-file-location
                           (expand-file-name (alist-get 'file c) root)
                           (alist-get 'line c) 0)))
             (alist-get 'citedBy note))
     (mapcar (lambda (l)
               (xref-make (format "links to %s" ref)
                          (xref-make-file-location
                           (expand-file-name (alist-get 'from l) root)
                           (alist-get 'line l) 0)))
             (alist-get 'linksIn note)))))

(cl-defmethod xref-backend-identifier-completion-table ((_backend (eql lore)))
  "Every note's name."
  (mapcar #'lore--name (lore--notes)))

;;;; eldoc: the summary of the note at point

(defvar lore--summary-cache (make-hash-table :test #'equal))

(defun lore-eldoc (callback &rest _)
  "Show the title and summary of the note named at point, through CALLBACK."
  (when-let* ((root (lore-root)) (ref (lore--ref-at-point)))
    (let* ((key (cons root ref))
           (note (or (gethash key lore--summary-cache)
                     (puthash key (or (lore--find ref root) 'none) lore--summary-cache))))
      (when (consp note)
        (funcall callback (or (alist-get 'summary note) "")
                 :thing (alist-get 'title note) :face 'lore-title)))))

;;;; Completion after [[ and lore:

(defun lore--name-table (names)
  "A completion table of note NAMES that also matches by file name.
Typing \"bil\" offers \"spec/billing\", and completing inserts the
qualified name lore writes."
  (lambda (string pred action)
    (let ((hits (seq-filter (lambda (n) (or (string-prefix-p string n t)
                                            (string-prefix-p string (file-name-nondirectory n) t)))
                            names)))
      (pcase action
        ('metadata '(metadata (category . lore-note)))
        ('lambda (and (member string names) t))
        ('t (all-completions "" hits pred))
        ('nil (let ((hits (if pred (seq-filter pred hits) hits)))
                (cond ((null hits) nil)
                      ((and (null (cdr hits)) (equal (car hits) string)) t)
                      ((null (cdr hits)) (car hits))
                      (t (let ((common (try-completion string hits)))
                           (if (stringp common) common string))))))
        (_ nil)))))

(defun lore-completion-at-point ()
  "Complete a note name after [[ or lore:."
  (when-let* ((root (lore-root))
              ((looking-back "\\(?:\\[\\[\\|lore:\\)\\([[:alnum:]_./-]*\\)"
                             (line-beginning-position))))
    (let ((start (match-beginning 1)) (end (match-end 1))
          (titles (make-hash-table :test #'equal)))
      (dolist (n (lore--notes root))
        (puthash (lore--name n) (alist-get 'title n) titles))
      (list start end (lore--name-table (hash-table-keys titles))
            :exclusive 'no
            :annotation-function
            (lambda (name) (when-let* ((title (gethash name titles)))
                             (concat "  " title)))))))

;;;; Flymake: lore check

(defun lore-flymake (report-fn &rest _)
  "Report `lore check' problems in this buffer's file to REPORT-FN.
lore reads the disk, so this reflects the file as last saved."
  (let ((buffer (current-buffer)) (file buffer-file-name) (root (lore-root)))
    (if (not (and file root))
        (funcall report-fn nil)
      (lore--run-async
       '("check")
       (lambda (data)
         (when (buffer-live-p buffer)
           (with-current-buffer buffer
             (let ((rel (lore--relative file root)))
               (funcall
                report-fn
                (cl-loop for p in (alist-get 'problems data)
                         when (equal (alist-get 'file p) rel)
                         collect (let ((region (flymake-diag-region buffer (alist-get 'line p))))
                                   (flymake-make-diagnostic
                                    buffer (car region) (cdr region)
                                    :warning (alist-get 'message p)))))))))
       root))))

;;;; Commands

(defun lore--read-note (prompt)
  "Read a note name with PROMPT, offering the one at point first."
  (let* ((ref (lore--ref-at-point))
         (root (lore-root))
         (notes (and root (lore--notes root)))
         (here (and buffer-file-name root
                    (seq-find (lambda (n) (equal (alist-get 'path n)
                                                 (lore--relative buffer-file-name root)))
                              notes))))
    (completing-read prompt (lore--name-table (mapcar #'lore--name notes)) nil nil nil nil
                     (or ref (and here (lore--name here))))))

(defun lore--text-buffer (name text root)
  "Show TEXT from lore in buffer NAME, with repo paths as buttons."
  (with-current-buffer (get-buffer-create name)
    (let ((inhibit-read-only t))
      (erase-buffer)
      (special-mode)
      (setq default-directory root)
      (insert text)
      (goto-char (point-min))
      (while (re-search-forward "\\([[:alnum:]_./-]+\\.\\(?:md\\|org\\|[jt]sx?\\|el\\|nix\\|py\\|go\\|rs\\)\\)\\(?::\\([0-9]+\\)\\)?" nil t)
        (let ((path (match-string-no-properties 1))
              (line (and (match-string 2) (string-to-number (match-string 2)))))
          (when (file-exists-p (expand-file-name path root))
            (make-text-button (match-beginning 0) (match-end 0)
                              'follow-link t 'help-echo path
                              'action (lambda (_)
                                        (lore--visit path root t)
                                        (when line
                                          (goto-char (point-min))
                                          (forward-line (1- line))))))))
      (goto-char (point-min)))
    (pop-to-buffer (current-buffer))))

;;;###autoload
(defun lore-next ()
  "Show what to do next, from `lore next'."
  (interactive)
  (let ((root (or (lore-root) (user-error "Not in a lore repo"))))
    (lore--text-buffer "*lore next*" (lore--run-text '("next") root) root)))

;;;###autoload
(defun lore-show (ref)
  "Show the note REF: its links, backlinks, citations and anchors."
  (interactive (list (lore--read-note "Show note: ")))
  (let ((root (or (lore-root) (user-error "Not in a lore repo"))))
    (lore--text-buffer "*lore show*" (lore--run-text (list "show" ref) root) root)))

;;;###autoload
(defun lore-check ()
  "Run `lore check' in a compilation buffer.
`next-error' then walks the problems."
  (interactive)
  (let ((default-directory (or (lore-root) (user-error "Not in a lore repo"))))
    (compilation-start (concat (shell-quote-argument lore-executable) " check")
                       nil (lambda (_) "*lore check*"))))

(defun lore--types (root)
  "The note types in ROOT's .lore/schema.yml."
  (let ((schema (expand-file-name ".lore/schema.yml" root)) types)
    (when (file-exists-p schema)
      (with-temp-buffer
        (insert-file-contents schema)
        (when (re-search-forward "^types:" nil t)
          (while (re-search-forward "^  \\([[:alpha:]][[:alnum:]_-]*\\):" nil t)
            (push (match-string-no-properties 1) types)))))
    (nreverse types)))

;;;###autoload
(defun lore-new (type title)
  "Create a note of TYPE called TITLE with `lore new', and visit it."
  (interactive
   (let ((root (or (lore-root) (user-error "Not in a lore repo"))))
     (list (completing-read "Type: " (lore--types root) nil t)
           (read-string "Title: "))))
  (let* ((root (lore-root))
         (result (lore--run (list "new" type title) root)))
    (clrhash lore--names-cache)
    (lore--visit (alist-get 'path result) root)))

(defun lore--note-command (command)
  "Run lore COMMAND on this buffer's note, then revert it."
  (let* ((root (or (lore-root) (user-error "Not in a lore repo")))
         (file (or buffer-file-name (user-error "This buffer has no file"))))
    (when (buffer-modified-p) (save-buffer))
    (let ((out (string-trim (lore--run-text (list command (lore--relative file root)) root))))
      (revert-buffer t t t)
      (message "%s" out))))

;;;###autoload
(defun lore-tick ()
  "Tick this effort's first open checklist item, and say what is next."
  (interactive)
  (lore--note-command "tick"))

;;;###autoload
(defun lore-freeze ()
  "Record the current version of every spec this effort is planned against."
  (interactive)
  (lore--note-command "freeze"))

(defvar-keymap lore-command-map
  :doc "lore commands.  Bind it to a prefix, for example C-c l."
  "n" #'lore-next
  "s" #'lore-show
  "c" #'lore-check
  "N" #'lore-new
  "t" #'lore-tick
  "f" #'lore-freeze
  "l" #'lore-sidebar-mode
  "g" #'lore-refresh)
(fset 'lore-command-map lore-command-map)

;;;; The minor mode

(defun lore--lighter ()
  "The mode line: lore, and how many notes govern this file once known."
  (if lore--note-count (format " lore:%d" lore--note-count) " lore"))

;;;###autoload
(define-minor-mode lore-mode
  "Toggle lore in a file of a lore repo.
\\[xref-find-definitions] on a citation (lore:<id>) or a link ([[name]])
opens the note, and \\[xref-find-references] finds the code and notes that
point at it.  Eldoc shows the summary of the
note at point.  Completion after [[ or lore: offers note names.  Flymake
shows `lore check' problems for this file."
  :lighter (:eval (lore--lighter))
  (if lore-mode
      (progn
        (add-hook 'xref-backend-functions #'lore--xref-backend -90 t)
        (add-hook 'eldoc-documentation-functions #'lore-eldoc nil t)
        (add-hook 'completion-at-point-functions #'lore-completion-at-point nil t)
        (add-hook 'flymake-diagnostic-functions #'lore-flymake nil t)
        (when-let* ((buffer (current-buffer)))
          (lore--context buffer #'ignore)))
    (remove-hook 'xref-backend-functions #'lore--xref-backend t)
    (remove-hook 'eldoc-documentation-functions #'lore-eldoc t)
    (remove-hook 'completion-at-point-functions #'lore-completion-at-point t)
    (remove-hook 'flymake-diagnostic-functions #'lore-flymake t)))

(defun lore--maybe-enable ()
  "Turn on `lore-mode' in a file inside a lore repo."
  (when (and buffer-file-name (lore-root)
             (executable-find lore-executable))
    (lore-mode 1)))

;;;###autoload
(define-globalized-minor-mode global-lore-mode lore-mode lore--maybe-enable)

;;;; Org

(defun lore--org-follow (ref _)
  "Follow an Org lore: link to the note REF names."
  (let ((note (or (lore--find ref) (user-error "No note matches %s" ref))))
    (lore--visit (alist-get 'path note))))

(with-eval-after-load 'org
  (declare-function org-link-set-parameters "ol")
  (org-link-set-parameters "lore" :follow #'lore--org-follow))

(provide 'lore)
;;; lore.el ends here
