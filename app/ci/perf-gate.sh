#!/usr/bin/env bash

set -euo pipefail

EXIT_NO_LOG=2
EXIT_BUDGET_FAIL=3

usage() {
  cat <<'EOF'
Usage: perf-gate.sh --log <file> --tool <name> --step <name> [--budgets <file>] [--avg-budget <ms>] [--p95-budget <ms>]

Checks JSONL performance logs for the given tool/step combination and enforces latency budgets.

Options:
  --log <file>         Path to JSONL performance log (required)
  --tool <name>        Tool identifier to evaluate (required)
  --step <name>        Step identifier to evaluate (required)
  --budgets <file>     Optional budgets JSON (default: none)
  --avg-budget <ms>    Optional average latency budget override
  --p95-budget <ms>    Optional p95 latency budget override
  -h, --help           Show this help text
EOF
}

log_file=""
tool=""
step=""
budgets_path=""
avg_budget=""
p95_budget=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --log)
      log_file="${2-}"
      shift 2
      ;;
    --tool)
      tool="${2-}"
      shift 2
      ;;
    --step)
      step="${2-}"
      shift 2
      ;;
    --budgets)
      budgets_path="${2-}"
      shift 2
      ;;
    --avg-budget|--avg)
      avg_budget="${2-}"
      shift 2
      ;;
    --p95-budget|--p95)
      p95_budget="${2-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$log_file" || -z "$tool" || -z "$step" ]]; then
  echo "Error: --log, --tool, and --step are required." >&2
  usage
  exit 1
fi

if [[ ! -f "$log_file" ]]; then
  echo "Error: log file '$log_file' does not exist." >&2
  exit $EXIT_NO_LOG
fi

if [[ ! -s "$log_file" ]]; then
  echo "Error: log file '$log_file' is empty." >&2
  exit $EXIT_NO_LOG
fi

if [[ -n "$budgets_path" ]]; then
  if [[ ! -f "$budgets_path" ]]; then
    echo "Error: budgets file '$budgets_path' does not exist." >&2
    exit 1
  fi

  file_avg=$(jq -r --arg tool "$tool" --arg step "$step" '.budgets[$tool][$step].avg // empty' "$budgets_path")
  file_p95=$(jq -r --arg tool "$tool" --arg step "$step" '.budgets[$tool][$step].p95 // empty' "$budgets_path")

  if [[ -z "$avg_budget" && -n "$file_avg" ]]; then
    avg_budget="$file_avg"
  fi
  if [[ -z "$p95_budget" && -n "$file_p95" ]]; then
    p95_budget="$file_p95"
  fi
fi

if [[ -z "$avg_budget" && -z "$p95_budget" ]]; then
  echo "Error: no budget thresholds provided for $tool/$step." >&2
  exit 1
fi

tmp_values=$(mktemp)
tmp_sorted=$(mktemp)
trap 'rm -f "$tmp_values" "$tmp_sorted"' EXIT

jq -r --arg tool "$tool" --arg step "$step" 'select(.tool == $tool and .step == $step) | .ms' "$log_file" > "$tmp_values"

count=$(wc -l < "$tmp_values" | tr -d ' ')
if [[ "$count" -eq 0 ]]; then
  echo "Error: no entries found in $log_file for $tool/$step." >&2
  exit $EXIT_NO_LOG
fi

sort -n "$tmp_values" > "$tmp_sorted"

avg=$(awk '{sum+=$1} END { if (NR==0) exit 1; printf "%.10f", sum/NR }' "$tmp_values")

percentile_idx=$(( (95 * count + 99) / 100 ))
p95=$(awk -v idx="$percentile_idx" 'NR==idx { printf "%.10f", $1; exit } END { if (idx>NR) exit 1 }' "$tmp_sorted")

printf 'CI Perf Gate: %s/%s\n' "$tool" "$step"
printf '  samples=%s avg=%.2fms p95=%.2fms\n' "$count" "$avg" "$p95"

fail=0

if [[ -n "$avg_budget" ]]; then
  printf '  avg budget <= %.2fms\n' "$avg_budget"
  avg_diff=$(awk -v actual="$avg" -v limit="$avg_budget" 'BEGIN { printf "%.2f", actual - limit }')
  if awk -v actual="$avg" -v limit="$avg_budget" 'BEGIN { exit(actual > limit ? 0 : 1) }'; then
    over=${avg_diff#-}
    printf '  [FAIL] avg exceeded: %.2fms > %.2fms (+%.2fms)\n' "$avg" "$avg_budget" "$over"
    fail=1
  else
    headroom=$(awk -v actual="$avg" -v limit="$avg_budget" 'BEGIN { printf "%.2f", limit - actual }')
    printf '  [OK] avg within budget (%.2fms headroom)\n' "$headroom"
  fi
fi

if [[ -n "$p95_budget" ]]; then
  printf '  p95 budget <= %.2fms\n' "$p95_budget"
  p95_diff=$(awk -v actual="$p95" -v limit="$p95_budget" 'BEGIN { printf "%.2f", actual - limit }')
  if awk -v actual="$p95" -v limit="$p95_budget" 'BEGIN { exit(actual > limit ? 0 : 1) }'; then
    over=${p95_diff#-}
    printf '  [FAIL] p95 exceeded: %.2fms > %.2fms (+%.2fms)\n' "$p95" "$p95_budget" "$over"
    fail=1
  else
    headroom=$(awk -v actual="$p95" -v limit="$p95_budget" 'BEGIN { printf "%.2f", limit - actual }')
    printf '  [OK] p95 within budget (%.2fms headroom)\n' "$headroom"
  fi
fi

if [[ "$fail" -eq 1 ]]; then
  exit $EXIT_BUDGET_FAIL
fi
