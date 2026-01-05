#!/usr/bin/env bash
set -e
OUT="bluebirdlearn.zip"
FILES=( index.html styles.css manifest.json logo.svg service-worker.js README.md package.json LICENSE )
SRC=( src )
rm -f "$OUT"
zip -r "$OUT" "${FILES[@]}" "${SRC[@]}"
echo "Created $OUT"