#!/bin/sh
# Copies the deploy-ready Code.gs to the clipboard.
#
# LC_CTYPE is mandatory. With no locale set, pbcopy assumes Mac OS Roman and
# silently turns every Chinese character into mojibake (太 -> Â§™). It survives
# a pbcopy|pbpaste round trip in the same shell, so it only shows up once the
# text reaches a UTF-8 app like the Apps Script editor.
cd "$(dirname "$0")/.." || exit 1
SRC="Code.READY.local.gs"
[ -f "$SRC" ] || { echo "Missing $SRC — run: node src/prepare-code.js <api-key>"; exit 1; }
LC_CTYPE=UTF-8 pbcopy < "$SRC"
LC_CTYPE=UTF-8 pbpaste | python3 -c "
import io, sys
clip = sys.stdin.read()
src = io.open(sys.argv[1], encoding='utf-8').read()
if clip.rstrip('\n') != src.rstrip('\n'):
    print('FAILED — the clipboard does not match the file. Do not paste.'); sys.exit(1)
print('Copied %d lines, verified identical to %s. Paste into the Apps Script editor.'
      % (clip.count(chr(10)) + 1, sys.argv[1]))
" "$SRC"
