const fs = require('fs');
const path = require('path');
const getStream = require('get-stream');
const diff = require('diff');
const tapPretty = require('../index');

function removeLastLine(str) {
  if (str.lastIndexOf('\n') > 0) {
    str = str.substring(0, str.lastIndexOf('\n'));
    return str.substring(0, str.lastIndexOf('\n'));
  }

  return str;
}

let failures = 0;
async function run() {
  const testCases = fs.readdirSync(`${__dirname}/expectations`);
  for (const test of testCases) {
    const outName = `${__dirname}/expectations/${test}`;
    const contents = fs.readFileSync(outName).toString('utf8');
    const inputName = `${__dirname}/fixtures/${path.basename(test, path.extname(test))}.tap`;

    const inStream = fs.createReadStream(inputName);
    const output = await getStream(tapPretty({}, inStream));

    console.log(inputName);
    const [same, removed, added] = diff.diffLines(removeLastLine(contents), removeLastLine(output));
    if (removed || added) {
      failures++;
      console.log('failed comparison:', same, removed, added);
    }
  }
}

run()
  .then(() => {
    if (failures > 0) process.exit(1);
  });
