{
  description = "lore: typed project notes linked to the code they govern";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      packages = forAllSystems (pkgs: {
        default = pkgs.stdenvNoCC.mkDerivation {
          pname = "lore";
          version = (builtins.fromJSON (builtins.readFile ./package.json)).version;
          src = ./.;
          nativeBuildInputs = [ pkgs.makeWrapper ];
          dontBuild = true;
          installPhase = ''
            mkdir -p $out/share/lore $out/bin
            cp -r src package.json $out/share/lore/
            # --no-install: with no node_modules, bun would otherwise try to
            # auto-install a missing import instead of failing.
            makeWrapper ${pkgs.bun}/bin/bun $out/bin/lore \
              --add-flags "run --no-install $out/share/lore/src/main.ts" \
              --prefix PATH : ${pkgs.lib.makeBinPath [ pkgs.ripgrep ]}
          '';
          meta = {
            mainProgram = "lore";
            license = pkgs.lib.licenses.mit;
          };
        };
      });

      checks = forAllSystems (pkgs: {
        default = pkgs.stdenvNoCC.mkDerivation {
          name = "lore-tests";
          src = ./.;
          nativeBuildInputs = [
            pkgs.bun
            pkgs.ripgrep
          ];
          buildPhase = ''
            export HOME=$TMPDIR
            bun test --no-install
          '';
          installPhase = "touch $out";
        };
      });

      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = [
            pkgs.bun
            pkgs.ripgrep
          ];
        };
      });
    };
}
