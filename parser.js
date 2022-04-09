const through = require('through2');
const yaml = require('js-yaml');
const fs = require('fs');

const re = {
  ok: new RegExp([
    '^(\\s\\s\\s\\s)?(not )?ok\\b(?:',
    '(?:\\s+(\\d+))?(?:\\s+(?:(?:\\s*-\\s*)?(.*)))?',
    ')?'
  ].join('')),
  plan: /^(\s\s\s\s)?(\d+)\.\.(\d+)/,
  comment: /^#\s*(.+)/,
  unbuffered_subtest: /^#\sSUBTEST:\s(.+)/i,
  version: /^TAP\s+version\s+(\d+)/i,
  label_todo: /^(.*?)\s*#\s*TODO\s*(.*)$/i,
  label_skip: /^(.*?)\s*#\s*SKIP\s*(.*)$/i,
  diag_open: /^\s+---$/,
  diag_close: /^\s+\.\.\.$/,
  bail_out: /^Bail out\!.*$/
};

function Parser() {
  let linePart = '';
  let lineNum = 0;
  let state = 'normal';
  let diagLines = [];
  let bailing = false;
  function parseLine(line) {
    if (bailing) return null;

    if (state === 'in-diag') {
      m = re.diag_close.exec(line);
      if (!m) {
        diagLines.push(line);
        return null;
      }
      else {
        state = 'normal';
        try {
          const diagText = diagLines.join('\n').replace(/\\'/g, "''"); // note: js-yaml expects '' as escape for ' rather than \'
          const value = yaml.load(diagText);
          // Note: yaml does not support values specified as "undefined" (without the quotes)
          // and js-yaml ends up parsing it as a string, which causes any failure message
          // to erroneously indicate that a string was found.
          // It would be possible to expand the yaml spec with a special !!js/undefined tag
          // tag and parse that as actual undefined type (see: https://github.com/nodeca/js-yaml-js-types )
          // but that would require TAP runners to output that and if they did that, then other
          // formatters would probably choke on it. So it does not seem feasible to improve
          // the situation without locking the runner to the formatter.
          // so as a hack, just always convert the string "undefined" to the type undefined.
          // and only do it for top level values (no "deep" hacking).
          if (value.expected === 'undefined') value.expected = undefined;
          if (value.actual === 'undefined') value.actual = undefined;

          diagLines = [];
          return { type: 'diag', value };
        } catch (e) {
          return {
            type: 'parseError', 
            line: lineNum,
            message: 'failed to parse yaml in diagnostic block',
            reason: e
          };
        }
      }
    } else if (m = re.version.exec(line)) {
      const ver = /^\d+(\.\d*)?$/.test(m[1]) ? Number(m[1]) : m[1];
      return { type: 'version', value: ver };
    } else if (m = re.comment.exec(line)) {
      if (re.unbuffered_subtest.exec(line)) {
        // unbuffered subtest starting
        return null;
      }

      return { type: 'comment', value: m[1] };
    } else if (m = re.ok.exec(line)) {
      const isChild = !!m[1];
      const ok = !m[2];
      const number = m[3] && Number(m[3]);
      const name = m[4];
      const okObj = { type: 'assert', isChild, ok, number, name, skipReason: null, todoReason: null };

      if (m = re.label_skip.exec(name)) {
        okObj.name = m[1];
        okObj.skipReason = m[2];
      }

      if (m = re.label_todo.exec(name)) {
        okObj.name = m[1];
        okObj.todoReason = m[2];
      }

      return okObj;
    } else if (m = re.plan.exec(line)) {
      const isChild = !!m[1];
      return { type: 'plan', isChild, start: Number(m[2]), end: Number(m[3]) };
    } else if (m = re.diag_open.exec(line)) {
      state = 'in-diag';
      return null;
    } else if (line.length === 0) {
      // ignore empty lines
      return null;
    } else {
      if (m = re.bail_out.exec(line)) {
        bailing = true;
      }
      return { type: 'extra', value: line };
    }

    return line;
  }

  const parser = through({ objectMode: true }, function(chunk, enc, cb) {
    const lines = (linePart + chunk).split('\n');
    for (const line of lines) {
      lineNum ++;
      const obj = parseLine(line);
      if (obj) {
        this.push(obj);
      }
    }
    linePart = lines[lines.length - 1];
    cb();
  });
  return parser;
}

module.exports = Parser;
