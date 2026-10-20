;;; lore-test.el --- Tests for lore.el  -*- lexical-binding: t; -*-

;; Runs against a real repo in a temp directory and the real `lore' on PATH:
;;
;;   emacs --batch -Q -L editors/emacs -l lore-test -f ert-run-tests-batch-and-exit

;;; Code:

(require 'ert)
(require 'lore)
(require 'org)

(defconst lore-test--files
  '(("docs/decisions/0001-money-in-cents.md" .
     "---\ntype: Decision\nstatus: accepted\nanchors: [src/billing/**]\n---\n# Money is integer cents\n\n## Decision\nMoney is a whole number of cents.\n")
    ("docs/specs/billing.org" .
     "#+title: Billing\n#+status: accepted\n\n* Goal\nCharge for things. See [[0001-money-in-cents]].\n")
    ("docs/efforts/charge.md" .
     "---\ntype: Effort\nstatus: active\nspecs: [\"[[billing]]\"]\n---\n# Charge\n\n## Tasks\n- [x] one\n- [ ] two\n- [ ] three\n")
    ("src/billing/charge.ts" .
     "// see lore:0001\nexport const charge = (priceCents: number) => priceCents;\n")
    ("src/other.ts" . "export const x = 1;\n"))
  "The test repo: one decision, an Org spec, an effort and some code.")

(defmacro lore-test--in-repo (&rest body)
  "Run BODY with `default-directory' at a fresh lore repo, then delete it."
  (declare (indent 0))
  `(let* ((root (file-name-as-directory (make-temp-file "lore-el-" t)))
          (default-directory root))
     (unwind-protect
         (progn
           (call-process "git" nil nil nil "init" "-q")
           (call-process lore-executable nil nil nil "init")
           (dolist (f lore-test--files)
             (make-directory (file-name-directory (expand-file-name (car f) root)) t)
             (with-temp-file (expand-file-name (car f) root) (insert (cdr f))))
           (clrhash lore--names-cache)
           (clrhash lore--summary-cache)
           ,@body)
       (dolist (b (buffer-list))
         (when (and (buffer-file-name b) (string-prefix-p root (buffer-file-name b)))
           (with-current-buffer b (set-buffer-modified-p nil))
           (kill-buffer b)))
       (delete-directory root t))))

(defun lore-test--wait (pred)
  "Wait up to 10 seconds for PRED to return non-nil, running processes."
  (let ((deadline (+ (float-time) 10)))
    (while (and (not (funcall pred)) (< (float-time) deadline))
      (accept-process-output nil 0.05))
    (funcall pred)))

(defun lore-test--visit (path)
  "Visit PATH in the test repo with `lore-mode' on, and return the buffer."
  (let ((buffer (find-file-noselect (expand-file-name path))))
    (with-current-buffer buffer (lore-mode 1))
    buffer))

(ert-deftest lore-root-finds-the-repo ()
  (lore-test--in-repo
    (should (equal (lore-root (expand-file-name "src/billing/")) root))
    (should-not (lore-root temporary-file-directory))))

(ert-deftest lore-ref-at-point-reads-citations-and-links ()
  (with-temp-buffer
    (insert "// see lore:0001. Also [[billing]] and [[file:prd.org][the PRD]] and [[https://x.y][web]].")
    (dolist (case '(("lore:0001" . "0001") ("billing]]" . "billing")
                    ("prd.org]" . "prd.org") ("x.y]" . nil) ("Also" . nil)))
      (goto-char (point-min))
      (search-forward (car case))
      (backward-char 2)
      (should (equal (lore--ref-at-point) (cdr case))))))

(ert-deftest lore-xref-opens-the-cited-note ()
  (lore-test--in-repo
    (with-current-buffer (lore-test--visit "src/billing/charge.ts")
      (goto-char (point-min))
      (search-forward "lore:00")
      (should (eq (lore--xref-backend) 'lore))
      (let ((defs (xref-backend-definitions 'lore (xref-backend-identifier-at-point 'lore))))
        (should (equal (mapcar #'xref-item-summary defs) '("Money is integer cents")))
        (should (equal (xref-location-group (xref-item-location (car defs)))
                       (expand-file-name "docs/decisions/0001-money-in-cents.md" root))))
      ;; Off a citation, M-. belongs to the next backend.
      (goto-char (point-max))
      (should-not (lore--xref-backend)))))

(ert-deftest lore-xref-references-find-citing-code-and-linking-notes ()
  (lore-test--in-repo
    (let ((refs (xref-backend-references 'lore "0001")))
      (should (equal (sort (mapcar (lambda (x) (file-relative-name
                                                (xref-location-group (xref-item-location x)) root))
                                   refs)
                           #'string<)
                     '("docs/specs/billing.org" "src/billing/charge.ts"))))))

(ert-deftest lore-eldoc-shows-the-summary ()
  (lore-test--in-repo
    (with-current-buffer (lore-test--visit "docs/specs/billing.org")
      (goto-char (point-min))
      (search-forward "[[0001")
      (let (got)
        (lore-eldoc (lambda (doc &rest props) (setq got (cons doc (plist-get props :thing)))))
        (should (equal got '("Money is a whole number of cents." . "Money is integer cents")))))))

(ert-deftest lore-completion-offers-note-names-after-brackets-and-lore ()
  (lore-test--in-repo
    (with-current-buffer (lore-test--visit "docs/specs/billing.org")
      (goto-char (point-max))
      (insert "Also [[bil")
      (pcase-let ((`(,start ,end ,table . ,props) (lore-completion-at-point)))
        (should (equal (buffer-substring start end) "bil"))
        (should (member "billing" (all-completions "bil" table)))
        (should (equal (funcall (plist-get props :annotation-function) "billing") "  Billing")))
      (insert "\nlore:00")
      (should (member "0001-money-in-cents"
                      (all-completions "00" (nth 2 (lore-completion-at-point)))))
      (insert " plain")
      (should-not (lore-completion-at-point)))))

(ert-deftest lore-flymake-reports-this-files-problems ()
  (lore-test--in-repo
    (with-temp-file "docs/specs/broken.org"
      (insert "#+title: Broken\n#+status: finished\n\nSee [[nope]].\n"))
    (with-current-buffer (lore-test--visit "docs/specs/broken.org")
      (let (diags done)
        (lore-flymake (lambda (d &rest _) (setq diags d done t)))
        (should (lore-test--wait (lambda () done)))
        (should (equal (mapcar (lambda (d) (cons (line-number-at-pos (flymake-diagnostic-beg d))
                                                 (string-trim (flymake-diagnostic-text d))))
                               diags)
                       '((2 . "'status' is 'finished'; expected one of draft, accepted, retired")
                         (4 . "link 'nope' matches no note"))))))
    ;; A clean file gets an empty report, which clears old diagnostics.
    (with-current-buffer (lore-test--visit "src/other.ts")
      (let (diags done)
        (lore-flymake (lambda (d &rest _) (setq diags d done t)))
        (should (lore-test--wait (lambda () done)))
        (should (null diags))))))

(ert-deftest lore-sidebar-lists-the-governing-notes ()
  (lore-test--in-repo
    (let ((buffer (lore-test--visit "src/billing/charge.ts")))
      (with-current-buffer buffer
        (should (lore-test--wait (lambda () lore--note-count)))
        (should (equal (lore--lighter) " lore:1")))
      (set-window-buffer (selected-window) buffer)
      (setq lore--sidebar-file nil)
      (lore-refresh)
      (should (lore-test--wait
               (lambda () (when-let* ((b (get-buffer lore--sidebar-name)))
                            (with-current-buffer b
                              (string-search "Money is integer cents" (buffer-string)))))))
      (with-current-buffer lore--sidebar-name
        (should (string-search "src/billing/charge.ts\n1 note" (buffer-string)))
        (should (string-search "cited at charge.ts:1; anchor src/billing/**" (buffer-string)))
        ;; The title is a button that opens the note.
        (goto-char (point-min))
        (search-forward "Money is")
        (push-button (1- (point)))
        (should (equal (buffer-file-name)
                       (expand-file-name "docs/decisions/0001-money-in-cents.md" root)))))))

(ert-deftest lore-tick-ticks-and-reverts ()
  (lore-test--in-repo
    (with-current-buffer (lore-test--visit "docs/efforts/charge.md")
      (lore-tick)
      (should (string-search "- [x] two\n- [ ] three" (buffer-string))))))

(ert-deftest lore-new-creates-and-visits-the-note ()
  (lore-test--in-repo
    (lore-new "Decision" "Round half to even")
    (should (equal (buffer-file-name)
                   (expand-file-name "docs/decisions/0002-round-half-to-even.md" root)))
    (should (string-search "# Round half to even" (buffer-string)))))

(ert-deftest lore-types-come-from-the-schema ()
  (lore-test--in-repo
    (should (equal (lore--types root) '("Spec" "Decision" "Effort")))))

(ert-deftest lore-org-link-follows-to-the-note ()
  (lore-test--in-repo
    (with-temp-buffer
      (org-mode)
      (insert "[[lore:0001][cents]]")
      (goto-char 3)
      (org-open-at-point)
      (should (equal (buffer-file-name)
                     (expand-file-name "docs/decisions/0001-money-in-cents.md" root))))))

(ert-deftest lore-mode-turns-on-only-inside-a-repo ()
  (lore-test--in-repo
    (global-lore-mode 1)
    (unwind-protect
        (progn
          (with-current-buffer (find-file-noselect (expand-file-name "src/other.ts"))
            (should lore-mode))
          (let ((outside (make-temp-file "lore-outside" nil ".ts")))
            (unwind-protect
                (with-current-buffer (find-file-noselect outside)
                  (should-not lore-mode)
                  (kill-buffer))
              (delete-file outside))))
      (global-lore-mode -1))))

(ert-deftest lore-errors-say-what-lore-said ()
  (lore-test--in-repo
    (should (equal (cadr (should-error (lore--run '("show" "nothing-here")) :type 'user-error))
                   "lore show: no note matches 'nothing-here'"))))

(provide 'lore-test)
;;; lore-test.el ends here
