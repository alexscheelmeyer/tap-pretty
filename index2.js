const Parser = require('tap-parser');
const { bold, cyan, dim, green, options, red, underline } = require('colorette');
const through = require('through2');
const duplexer = require('duplexer3');
const symbols = require('figures');

function isFinalStats (str) {
  return /^#\s(ok|tests|pass|fail|skip|failed):?\s{1,}\d?/.test(str);
}

function pad(str, n = 2) {
  return str.padStart(str.length + n);
}

function prettyStack (rawError) {
  return rawError.split('\n').map(pad).join('\n') + '\n';
}

function formatFail (f, hideStack) {
  const title = `${symbols.cross} ${f.name}`;
  const divider = Array.from(title, () => '-').join('');
  const err = [
    pad(`${red(title)}`, 4),
    pad(`${red(divider)}`, 4),
    pad(cyan(`Operator: ${f.diag.operator}`), 4),
    pad(cyan(`Expected: ${f.diag.expected}`), 4),
    pad(cyan(`Actual: ${f.diag.actual}`), 4),
    pad(cyan(`At: ${f.diag.at}`), 4)
  ];

  if (hideStack) {
    return err.join('\n');
  }

  return err.concat(pad(cyan(`  Stack: ${prettyStack(f.diag.stack)}`))).join('\n');
}


function tapPretty(argv) {
  const startTime = new Date().getTime();
  const tap = new Parser();
  const output = through();
  const stream = duplexer(tap, output);
  let skippedTests = 0;
  let lastStr = '';

  if (argv.disableColor) {
    options.enabled = false;
  }

  tap.on('pass', assert => {
    // process.stdout.write(pad(`${green(symbols.tick)} ${dim(assert.name)}\n`, 4));
    output.push(pad(`${green(symbols.tick)} ${dim(assert.name)}\n`, 4));
  })

  tap.on('fail', assert => {
    // process.stdout.write(formatFail(assert, argv.stack));
    output.push(formatFail(assert, argv.stack));

    stream.failed = true;
  })

  tap.on('skip', assert => {
    // process.stdout.write(pad(`${cyan('-  ' + assert.name)}\n`, 4));
    output.push(pad(`${cyan('-  ' + assert.name)}\n`, 4));
  })

  tap.on('comment', res => {
    const isSkip = /# SKIP/.test(res);

    if (isSkip || isFinalStats(res)) {
      if (isSkip) {
        skippedTests++;
      }

      return;
    }

    const cleanedStr = res.replace('# ', '');

    if (lastStr !== cleanedStr) {
      // process.stdout.write(`\n\n${pad(underline(cleanedStr))}\n`);
      output.push(`\n\n${pad(underline(cleanedStr))}\n`);
      lastStr = cleanedStr;
    }
  })

  tap.on('extra', function (extra) {
    // process.stdout.write(pad(extra, 4));
    output.push(pad(extra, 4));
  })

  tap.on('complete', results => {
    // console.log('hah');
    if ((results.count === 0 && results.skip === 0) || results.bailout) {
      process.exit(1);
    }

    if (argv.summarize) {
      const failCount = results.failures.length;
      const [past, plural] = failCount === 1 ? ['was', 'failure'] : ['were', 'failures'];
      const finalFailMsg = `${bold(red('Failed Tests:'))} There ${past} ${bold(red(failCount))} ${plural}\n\n`;

      output.push('\n' + pad(finalFailMsg));
      results.failures.forEach(f => output.push(`${formatFail(f, args.stack)}\n`));
    }
    output.push('\n' + pad(`Total: ${results.count}\n`));
    output.push(pad(green(`Passed: ${results.pass}\n`)));
    output.push(pad(red(`Failed: ${results.fail}\n`)));
    output.push(pad(cyan(`Skipped: ${skippedTests}\n`)));
    output.push(pad(`Duration: ${new Date().getTime() - startTime}ms\n\n`));
  });

  return stream;
}

module.exports = tapPretty;