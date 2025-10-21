#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

declare -a ALLOWLIST=("perf-status")

gather_commands() {
  local dir="$1"

  find "$dir" -maxdepth 1 -type f \( -name '*.js' -o -name '*.mjs' \) -print0 |
    while IFS= read -r -d '' file; do
      local filename="${file##*/}"
      local extension="${filename##*.}"
      if [[ "$extension" == "ts" ]]; then
        continue
      fi
      local name="${filename%.*}"
      printf '%s\n' "$name"
    done
}

catalog_commands=()
while IFS= read -r name; do
  catalog_commands+=("$name")
done < <(gather_commands "$ROOT_DIR/cli/commands")

app_commands=()
while IFS= read -r name; do
  app_commands+=("$name")
done < <(gather_commands "$ROOT_DIR/app/cli")

duplicates=()

for catalog_name in "${catalog_commands[@]}"; do
  for app_name in "${app_commands[@]}"; do
    if [[ "$catalog_name" == "$app_name" ]]; then
      duplicates+=("$catalog_name")
      break
    fi
  done
done

unique_duplicates=()
for name in "${duplicates[@]-}"; do
  duplicate_seen=false
  for existing in "${unique_duplicates[@]-}"; do
    if [[ "$existing" == "$name" ]]; then
      duplicate_seen=true
      break
    fi
  done
  if [[ "$duplicate_seen" == false ]]; then
    unique_duplicates+=("$name")
  fi
done

filtered=()
for name in "${unique_duplicates[@]-}"; do
  skip=false
  for allowed in "${ALLOWLIST[@]-}"; do
    if [[ "$name" == "$allowed" ]]; then
      skip=true
      break
    fi
  done
  if [[ "$skip" == false ]]; then
    filtered+=("$name")
  fi
done

if [[ ${#filtered[@]-0} -gt 0 ]]; then
  echo "Duplicate command names detected across CLI surfaces:" >&2
  for name in "${filtered[@]-}"; do
    echo "  - $name" >&2
  done
  echo "Update the allowlist in scripts/ci/check-duplicate-commands.sh or rename one of the commands." >&2
  exit 1
fi

echo "No duplicate command names detected between /cli and /app/cli surfaces."
