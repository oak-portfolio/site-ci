#!/bin/sh
# One-time per clone: use the committed hooks in .githooks.
git config core.hooksPath .githooks
echo "core.hooksPath=$(git config core.hooksPath)"
