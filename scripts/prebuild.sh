#!/bin/bash
set -e

mkdir -p scratch
cd scratch

npm init -y
npm install hanzi-writer hanzi-writer-data

curl -sLO https://raw.githubusercontent.com/skishore/makemeahanzi/master/dictionary.txt
curl -sLO https://raw.githubusercontent.com/BYVoid/OpenCC/master/data/dictionary/STCharacters.txt
curl -sLO https://raw.githubusercontent.com/BYVoid/OpenCC/master/data/dictionary/TSCharacters.txt

curl -sL "https://lingua.mtsu.edu/chinese-computing/statistics/char/download.php?Which=MO" \
  | iconv -f GB18030 -t UTF-8 > junda_utf8.txt

cd ..
node scripts/build-data.mjs scratch .