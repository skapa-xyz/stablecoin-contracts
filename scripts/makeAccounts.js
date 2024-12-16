const fs = require("fs");

// Make accounts with 1 trillion Ether
const makeAccount = () => {
  acc = `{ privateKey: "${randomHex()}", balance: _1e36Str }`;
  return acc;
};

const randomHex = () => {
  const hexChars = "abcdefABCDEF0123456789";
  let hexCharArray = ["0x"];

  for (i = 0; i < 64; i++) {
    hexCharArray.push(randomChar(hexChars));
  }
  // console.log("hexarray is" + hexCharArray)
  return hexCharArray.join("");
};

const randomChar = (chars) => {
  const len = chars.length;
  const idx = Math.floor(len * Math.random());

  return chars[idx];
};

const makeHardhatAccountsList = (n) => {
  const accountsDict = {};
  const accounts = [];

  let i = 0;
  let account;

  while (i < n) {
    console.log(i);
    account = makeAccount();
    // console.log("account is" + account)
    if (Object.keys(accountsDict).includes(account)) {
      i += 1;
      continue;
    } else {
      accounts.push(account);
      accountsDict[account] = true;
      i += 1;
    }
  }

  return `const _1e36Str = "1000000000000000000000000000000000000";

  const accountsList = [
${accounts.join(",\n")}
]

module.exports = {
  accountsList: accountsList
};`;
};

// Construct accounts array data
const arrayList = makeHardhatAccountsList(Number(process.argv[2]) || 2000);

// console.log(arrayList)
fs.appendFileSync("accountsList.js", arrayList);
