#!/usr/bin/env bash

REPORT_FILE=mythril-log.md

rm -f $REPORT_FILE

CONTRACTS=`find contracts contracts/ProtocolToken contracts/LPRewards -mindepth 1 -maxdepth 1 -name '*.sol'`

for CONTRACT in $CONTRACTS; do
  printf "Processing $CONTRACT\n"
  myth analyze $CONTRACT --solv v0.7.6 -o markdown >> $REPORT_FILE
  printf "Done $CONTRACT\n"
done

printf "\e[32m✔ Mythril analysis done, report file created: $REPORT_FILE.\e[0m\n"