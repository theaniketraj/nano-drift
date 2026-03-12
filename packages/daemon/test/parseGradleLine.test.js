const test = require('node:test');
const assert = require('node:assert/strict');

const { parseGradleLine } = require('../out/gradle/index.js');

test('parseGradleLine parses new-format Kotlin compiler errors', () => {
  const result = parseGradleLine('e: file:///tmp/app/src/MainActivity.kt:42:13: unresolved reference: fooBar');

  assert.deepEqual(result, {
    file: '/tmp/app/src/MainActivity.kt',
    line: 42,
    column: 13,
    severity: 'error',
    message: 'unresolved reference: fooBar',
  });
});

test('parseGradleLine parses old-format Kotlin compiler warnings', () => {
  const result = parseGradleLine('w: /tmp/app/src/MainActivity.kt: (10, 5): variable is never used');

  assert.deepEqual(result, {
    file: '/tmp/app/src/MainActivity.kt',
    line: 10,
    column: 5,
    severity: 'warning',
    message: 'variable is never used',
  });
});

test('parseGradleLine parses Java compiler errors', () => {
  const result = parseGradleLine('/tmp/app/src/MainActivity.java:99: error: cannot find symbol');

  assert.deepEqual(result, {
    file: '/tmp/app/src/MainActivity.java',
    line: 99,
    column: 0,
    severity: 'error',
    message: 'cannot find symbol',
  });
});

test('parseGradleLine ignores unrelated Gradle output', () => {
  assert.equal(parseGradleLine('> Task :app:compileDebugKotlin'), undefined);
});
