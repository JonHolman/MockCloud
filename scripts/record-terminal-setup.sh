#!/bin/bash
set -eu
cd ~/temp
lsof -ti :4444 | xargs kill -9 2>/dev/null || true
pkill -f DynamoDBLocal 2>/dev/null || true
rm -rf MockCloud
export YARN_ENABLE_PROGRESS_BARS=false
export AWS_PAGER=
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec vhs "$SCRIPT_DIR/record-terminal-demo.tape"
