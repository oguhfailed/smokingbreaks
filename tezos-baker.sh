#!/usr/bin/env bash
# tezos-baker.sh — Run a Tezos baking node
# Usage: ./tezos-baker.sh [COMMAND]
#
# Commands:
#   setup     — First-time setup: init data dir, import key, configure
#   start     — Start node + baker + accuser
#   stop      — Stop all Tezos processes
#   status    — Show running processes and sync status
#   logs      — Tail logs for node / baker / accuser
#   help      — Show this help message (default)

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration — override any of these via environment variables
# ---------------------------------------------------------------------------
: "${NETWORK:=mainnet}"                       # mainnet | ghostnet | weeklynet | ...
: "${DATA_DIR:=$HOME/.tezos-node}"            # octez-node data directory
: "${LOG_DIR:=$HOME/.tezos-logs}"             # directory for log files
: "${BAKER_ALIAS:=my_baker}"                  # key alias in the octez wallet
: "${LIQUIDITY_BAKING_VOTE:=pass}"            # on | off | pass
: "${RPC_ADDR:=127.0.0.1}"                    # RPC listen address
: "${RPC_PORT:=8732}"                         # RPC listen port
: "${P2P_PORT:=9732}"                         # P2P listen port

# Octez binaries — set full paths here if they are not on $PATH
: "${OCTEZ_NODE:=octez-node}"
: "${OCTEZ_CLIENT:=octez-client}"
: "${OCTEZ_BAKER:=octez-baker}"               # protocol-specific binary, e.g. octez-baker-PtParisB
: "${OCTEZ_ACCUSER:=octez-accuser}"           # protocol-specific binary

RPC_URL="http://${RPC_ADDR}:${RPC_PORT}"

# ---------------------------------------------------------------------------
# Colours
# ---------------------------------------------------------------------------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
die()     { echo -e "${RED}[ERROR]${RESET} $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
require_bin() {
    command -v "$1" &>/dev/null || die "'$1' not found. Install octez or set the \$$( echo "$1" | tr '[:lower:]' '[:upper:]' | tr '-' '_') variable."
}

pid_file() { echo "/tmp/tezos-${1}.pid"; }

is_running() {
    local pf; pf="$(pid_file "$1")"
    [[ -f "$pf" ]] && kill -0 "$(cat "$pf")" 2>/dev/null
}

wait_for_rpc() {
    info "Waiting for node RPC to become available..."
    local i=0
    until curl -sf "${RPC_URL}/version" &>/dev/null; do
        sleep 2
        (( i++ ))
        [[ $i -gt 60 ]] && die "Node RPC did not start within 120 s."
    done
    success "RPC is up."
}

wait_for_bootstrap() {
    info "Waiting for node to be bootstrapped (this can take a while on first run)..."
    until $OCTEZ_CLIENT --endpoint "$RPC_URL" bootstrapped &>/dev/null; do
        sleep 10
    done
    success "Node is bootstrapped."
}

# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

cmd_setup() {
    info "=== Tezos Baker — First-Time Setup ==="
    require_bin "$OCTEZ_NODE"
    require_bin "$OCTEZ_CLIENT"

    mkdir -p "$DATA_DIR" "$LOG_DIR"

    # Initialise node configuration
    if [[ ! -f "$DATA_DIR/config.json" ]]; then
        info "Initialising node configuration for network: ${BOLD}${NETWORK}${RESET}"
        $OCTEZ_NODE config init \
            --data-dir "$DATA_DIR" \
            --network  "$NETWORK" \
            --rpc-addr "${RPC_ADDR}:${RPC_PORT}" \
            --net-addr "0.0.0.0:${P2P_PORT}"
        success "Node config written to $DATA_DIR/config.json"
    else
        warn "Node config already exists — skipping config init."
    fi

    # Generate a new identity if needed
    if [[ ! -f "$DATA_DIR/identity.json" ]]; then
        info "Generating node identity (proof-of-work, please wait)..."
        $OCTEZ_NODE identity generate --data-dir "$DATA_DIR"
        success "Identity generated."
    else
        warn "Identity already exists — skipping."
    fi

    # Import baker key
    echo
    info "Baker key setup"
    echo "Choose how to import your baker key:"
    echo "  1) Generate a fresh key (testing / new baker)"
    echo "  2) Import from mnemonic"
    echo "  3) Import from secret key (edsk…)"
    echo "  4) Skip (key already imported)"
    read -rp "Choice [1-4]: " key_choice

    case "$key_choice" in
        1)
            $OCTEZ_CLIENT --endpoint "$RPC_URL" gen keys "$BAKER_ALIAS"
            success "Key '${BAKER_ALIAS}' generated."
            ;;
        2)
            read -rp "Enter mnemonic (space-separated words): " mnemonic
            $OCTEZ_CLIENT --endpoint "$RPC_URL" \
                import keys from mnemonic "$BAKER_ALIAS" -- $mnemonic
            success "Key imported from mnemonic."
            ;;
        3)
            read -rsp "Enter secret key (edsk…): " secret_key; echo
            $OCTEZ_CLIENT --endpoint "$RPC_URL" \
                import secret key "$BAKER_ALIAS" unencrypted:"$secret_key"
            success "Key imported."
            ;;
        4)
            warn "Skipping key import."
            ;;
        *)
            die "Invalid choice."
            ;;
    esac

    echo
    success "Setup complete. Run '${BOLD}$0 start${RESET}' to begin baking."
}

cmd_start() {
    info "=== Starting Tezos Baker Stack ==="
    require_bin "$OCTEZ_NODE"
    require_bin "$OCTEZ_CLIENT"
    require_bin "$OCTEZ_BAKER"
    require_bin "$OCTEZ_ACCUSER"

    mkdir -p "$LOG_DIR"

    # --- Node ---
    if is_running node; then
        warn "Node is already running (PID $(cat "$(pid_file node)"))."
    else
        info "Starting octez-node..."
        $OCTEZ_NODE run \
            --data-dir "$DATA_DIR" \
            --rpc-addr "${RPC_ADDR}:${RPC_PORT}" \
            >>"$LOG_DIR/node.log" 2>&1 &
        echo $! > "$(pid_file node)"
        success "Node started (PID $!)."
    fi

    wait_for_rpc
    wait_for_bootstrap

    # --- Baker ---
    if is_running baker; then
        warn "Baker is already running (PID $(cat "$(pid_file baker)"))."
    else
        info "Starting octez-baker (alias: ${BAKER_ALIAS})..."
        $OCTEZ_BAKER \
            --endpoint "$RPC_URL" \
            run with local node "$DATA_DIR" \
            --liquidity-baking-toggle-vote "$LIQUIDITY_BAKING_VOTE" \
            "$BAKER_ALIAS" \
            >>"$LOG_DIR/baker.log" 2>&1 &
        echo $! > "$(pid_file baker)"
        success "Baker started (PID $!)."
    fi

    # --- Accuser ---
    if is_running accuser; then
        warn "Accuser is already running (PID $(cat "$(pid_file accuser)"))."
    else
        info "Starting octez-accuser..."
        $OCTEZ_ACCUSER \
            --endpoint "$RPC_URL" \
            run \
            >>"$LOG_DIR/accuser.log" 2>&1 &
        echo $! > "$(pid_file accuser)"
        success "Accuser started (PID $!)."
    fi

    echo
    success "All processes running. Logs are in ${LOG_DIR}/"
    cmd_status
}

cmd_stop() {
    info "=== Stopping Tezos Baker Stack ==="
    for proc in accuser baker node; do
        local pf; pf="$(pid_file "$proc")"
        if is_running "$proc"; then
            local pid; pid="$(cat "$pf")"
            kill "$pid" && rm -f "$pf"
            success "Stopped ${proc} (PID ${pid})."
        else
            warn "${proc} is not running."
        fi
    done
}

cmd_status() {
    echo
    echo -e "${BOLD}=== Tezos Baker Status ===${RESET}"
    for proc in node baker accuser; do
        if is_running "$proc"; then
            echo -e "  ${GREEN}●${RESET} ${proc}  (PID $(cat "$(pid_file "$proc")"))"
        else
            echo -e "  ${RED}●${RESET} ${proc}  (not running)"
        fi
    done

    echo
    if curl -sf "${RPC_URL}/monitor/bootstrapped" &>/dev/null; then
        local level; level=$($OCTEZ_CLIENT --endpoint "$RPC_URL" \
            rpc get /chains/main/blocks/head/header 2>/dev/null \
            | python3 -c "import sys,json; print('Level:', json.load(sys.stdin).get('level','?'))" 2>/dev/null \
            || echo "Level: (unavailable)")
        echo -e "  ${CYAN}Chain head${RESET}: $level"
    else
        warn "Node RPC not reachable at ${RPC_URL}."
    fi

    if is_running baker; then
        local addr
        addr=$($OCTEZ_CLIENT --endpoint "$RPC_URL" show address "$BAKER_ALIAS" 2>/dev/null | awk '/Hash/{print $2}') || true
        [[ -n "$addr" ]] && echo -e "  ${CYAN}Baker address${RESET}: $addr"
    fi
    echo
}

cmd_logs() {
    local proc="${1:-all}"
    if [[ "$proc" == "all" ]]; then
        info "Tailing all logs (Ctrl-C to stop)..."
        tail -f "$LOG_DIR"/node.log "$LOG_DIR"/baker.log "$LOG_DIR"/accuser.log 2>/dev/null
    else
        local lf="$LOG_DIR/${proc}.log"
        [[ -f "$lf" ]] || die "Log file not found: $lf"
        tail -f "$lf"
    fi
}

cmd_help() {
    cat <<EOF

${BOLD}tezos-baker.sh${RESET} — Manage a Tezos baking node

${BOLD}Usage:${RESET}
  $0 <command> [options]

${BOLD}Commands:${RESET}
  setup       First-time configuration: init data dir, identity, and key
  start       Start node, baker, and accuser
  stop        Stop all running Tezos processes
  status      Show process and chain status
  logs [svc]  Tail logs (node | baker | accuser | all)
  help        Show this message

${BOLD}Configuration (env vars):${RESET}
  NETWORK                  ${NETWORK}
  DATA_DIR                 ${DATA_DIR}
  LOG_DIR                  ${LOG_DIR}
  BAKER_ALIAS              ${BAKER_ALIAS}
  LIQUIDITY_BAKING_VOTE    ${LIQUIDITY_BAKING_VOTE}   (on | off | pass)
  RPC_ADDR / RPC_PORT      ${RPC_ADDR}:${RPC_PORT}
  P2P_PORT                 ${P2P_PORT}
  OCTEZ_NODE               ${OCTEZ_NODE}
  OCTEZ_CLIENT             ${OCTEZ_CLIENT}
  OCTEZ_BAKER              ${OCTEZ_BAKER}
  OCTEZ_ACCUSER            ${OCTEZ_ACCUSER}

${BOLD}Example — ghostnet quick-start:${RESET}
  NETWORK=ghostnet BAKER_ALIAS=ghost_baker $0 setup
  NETWORK=ghostnet BAKER_ALIAS=ghost_baker $0 start

EOF
}

# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------
COMMAND="${1:-help}"
shift || true

case "$COMMAND" in
    setup)  cmd_setup  "$@" ;;
    start)  cmd_start  "$@" ;;
    stop)   cmd_stop   "$@" ;;
    status) cmd_status "$@" ;;
    logs)   cmd_logs   "$@" ;;
    help|--help|-h) cmd_help ;;
    *) die "Unknown command: ${COMMAND}. Run '$0 help' for usage." ;;
esac
