#!/usr/bin/env bash
# بديل لينكس لـ start-chess.ps1: بيرفع رابط ngrok الحالي على url.json في الريبو.
# التوكن مش مكتوب هنا — بيتقري من .env (GH_TOKEN / GH_REPO) اللي هو gitignored،
# عشان الملف ده يفضل آمن للتتبّع في git.
#
# الاستخدام:  ./update-url.sh https://xxxx.ngrok-free.dev
set -euo pipefail

URL="${1:-}"
[ -z "$URL" ] && { echo "update-url.sh: no URL given" >&2; exit 1; }

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# تحميل GH_TOKEN و GH_REPO من .env من غير ما نطبع أي أسرار
if [ -f "$DIR/.env" ]; then
  # نقرا المفتاحين بس، ونشيل أي علامات تنصيص حواليهم
  GH_TOKEN="$(grep -E '^GH_TOKEN=' "$DIR/.env" | head -1 | cut -d= -f2- | tr -d '"'"'"'' | tr -d '\r')"
  GH_REPO="$(grep -E '^GH_REPO=' "$DIR/.env" | head -1 | cut -d= -f2- | tr -d '"'"'"'' | tr -d '\r')"
fi

: "${GH_TOKEN:=}"
: "${GH_REPO:=}"
[ -z "$GH_TOKEN" ] && { echo "update-url.sh: GH_TOKEN missing in .env" >&2; exit 1; }
[ -z "$GH_REPO" ]  && { echo "update-url.sh: GH_REPO missing in .env"  >&2; exit 1; }

FILE="url.json"
API="https://api.github.com/repos/$GH_REPO/contents/$FILE"

# محتوى url.json = {"url":"..."} متحوّل base64 زي ما GitHub Contents API بيطلب
CONTENT_B64="$(printf '{"url":"%s"}' "$URL" | base64 | tr -d '\n')"

# جيب الـsha الحالي عشان نقدر نعمل update (مش هيكون موجود أول مرة)
SHA="$(curl -sS -H "Authorization: token $GH_TOKEN" \
       -H "Accept: application/vnd.github.v3+json" "$API" \
     | grep -m1 '"sha"' | cut -d'"' -f4 || true)"

if [ -n "$SHA" ]; then
  BODY="$(printf '{"message":"update server url","content":"%s","sha":"%s"}' "$CONTENT_B64" "$SHA")"
else
  BODY="$(printf '{"message":"update server url","content":"%s"}' "$CONTENT_B64")"
fi

curl -sS -X PUT -H "Authorization: token $GH_TOKEN" \
     -H "Accept: application/vnd.github.v3+json" \
     -d "$BODY" "$API" >/dev/null

echo "URL uploaded: $URL"
