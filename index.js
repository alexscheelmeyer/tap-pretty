const Parser = require('./parser');
const { bold, green, inverse, red, underline, white, gray, blue } = require('colorette');
const through = require('through2');
const symbols = require('figures');
const prettyms = require('pretty-ms');
const difflet = require('difflet');
const diff = require('diff');

function pad(str, n = 2) {
  return str.padStart(str.length + n);
}

function isFinalStats(str) {
  return /^(ok|tests|pass|fail|skip|failed):?\s{0,}\d?/.test(str);
}

function diffColorer(obj) {
  function valueMapper(val) {
    return val.replace(/\n/g, '<newline').replace(/\s/g, '<whitespace>');
  }

  if (obj.added) {
    return inverse(green(valueMapper(obj.value)));
  } else if (obj.removed) {
    return inverse(red(valueMapper(obj.value)));
  }

  return obj.value;
}

function tapPretty(argv, inputStream) {
  const startTime = new Date().getTime();
  const tap = Parser();
  const errors = [];
  let countedAsserts = 0;
  let countedPasses = 0;
  let plan = null;
  let subPlan = null;

  const writer = through.obj(function transformer(obj, enc, cb) {
    switch (obj.type) {
      case 'plan': {
        if (obj.isChild) {
          if (subPlan) {
            this.emit('error', 'more than one plan found');
            return;
          }
          subPlan = obj;
        } else {
          if (plan) {
            this.emit('error', 'more than one plan found');
            return;
          }
          plan = obj;
        }
        break;
      }
      case 'version': {
        // ignore for now
        break;
      }
      case 'assert': {
        const self = this;
        function pushSkippedAssert(assertObj) {
          const indent = assertObj.isChild ? 8 : 4;
          if (assertObj.skipReason !== null) {
            self.push(pad(gray(`[SKIPPED] ${assertObj.name || ''}\n`), indent));
          } else {
            self.push(pad(underline(`[TODO] ${assertObj.name || ''}\n`), indent));
          }
        }
        function pushAssert(assertObj) {
          const indent = assertObj.isChild ? 8 : 4;
          if (assertObj.ok) {
            self.push(pad(`${green(symbols.tick)} ${gray(assertObj.name || '')}\n`, indent));
          } else {
            self.push(pad(red(`${symbols.cross} ${assertObj.name || ''}\n`), indent));
          }
        }

        if (plan && (obj.number > plan.end || obj.number < plan.start)) {
          const message = `Bad test number "${obj.number}", ${plan.start} to ${plan.end} expected\n`;
          this.push(pad(red(message)));
          break;
        }

        const doCount = !(obj.skipReason !== null || obj.todoReason !== null);
        if (doCount && !obj.isChild) countedAsserts++;
        if (obj.ok) {
          if (doCount) {
            if (!obj.isChild) countedPasses++;
            pushAssert(obj);
          } else {
            pushSkippedAssert(obj);
          }
        } else if (doCount) {
          if (!obj.isChild) errors.push(obj.name);
          pushAssert(obj);
        } else {
          pushSkippedAssert(obj);
        }
        break;
      }
      case 'comment': {
        if (!isFinalStats(obj.value)) {
          this.push(`\n${pad(white(bold((obj.value))))}\n`);
        }
        break;
      }
      case 'summary': {
        const { numAsserts, numPassed, numErrors, time } = obj;
        this.push('\n');
        if (numErrors) {
          this.push(red(bold(`${numErrors} of ${numAsserts} failing\n`)));
        }
        this.push(green(bold(`${numPassed} of ${numAsserts} passing\n`)));
        this.push(gray(`(in ${prettyms(time)})\n`));
        break;
      }
      case 'diag': {
        if ('expected' in obj.value && 'actual' in obj.value) {
          const diagIndent = (s) => `      ${s}`;
          const { expected, actual } = obj.value;
          if (typeof expected !== typeof actual) {
            const actualStr = typeof actual === 'object' ? JSON.stringify(actual) : String(actual);
            this.push(diagIndent(underline(red(`Expected ${typeof expected} (${expected}), but got ${typeof actual} (${actualStr})\n`))));
          } else if (typeof expected === 'object') {
            const str = difflet({ indent: 2, comment: true }).compare(expected, actual);
            this.push(diagIndent(`${str.replace(/\n/g, '\n      ')}\n`));
          } else if (typeof expected === 'string') {
            const objs = diff.diffChars(expected, actual);
            this.push(diagIndent(`${objs.map(diffColorer).join('')}\n`));
          } else {
            this.push(diagIndent(underline(red(`Expected ${expected}, but got ${actual}\n`))));
          }
        } else if (obj.value.operator === 'error' && 'stack' in obj.value) {
          // Prettier error message
          const diagIndent = (s) => `      ${s}`;
          const errorLines = obj.value.stack.split('\n').slice(1);
          const indentedErrorLines = errorLines.map((l) => diagIndent(l)).join('\n');
          this.push(gray(indentedErrorLines));
        }
        break;
      }
      case 'extra': {
        this.push(pad(`${blue(obj.value)}\n`, 4));
        break;
      }
      default:
        this.push(JSON.stringify(obj));
        break;
    }

    cb();
  });

  tap.on('finish', () => {
    const numAsserts = countedAsserts;
    const numErrors = errors.length;
    const time = new Date().getTime() - startTime;

    writer.write({ type: 'summary', numAsserts, numPassed: countedPasses, numErrors, time });
  });

  return inputStream.pipe(tap).pipe(writer);
}

module.exports = tapPretty;
