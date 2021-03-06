//
// ABANDON ALL HOPE, ALL YE WHO ENTER HERE
//
// This is just a quick-n-dirty parser to bootstrap src/api.json
// This code may be thrown away, so don't love it.
//
var fs = require('fs')
var path = require('path')
var stringify = require('json-stringify-pretty-compact')

var api = {
  errors: {},
  functions: {}
}

var dir = path.resolve(__dirname, '../../../libindy/include')
fs.readdirSync(dir).forEach(function (file) {
  file = path.resolve(dir, file)

  var group = path.basename(file).replace(/^indy_|\.h$/g, '')
  var hText = fs.readFileSync(file, 'utf8') + '\n'
  parseSection(group, hText)
})

function parseSection (group, hText) {
  // split it into lines and remove comments and # lines
  var lines = hText
    .split('\n')
    .map(function (line) {
      return line
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^#.*$/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    })
    .map(function (line) {
      return /^\/\//.test(line)
        ? line
        : line.replace(/\/\/.*$/g, '').trim()
    })
    .filter(function (line) {
      return line.length > 0
    })

  // extract all inside the `extern "C" { (.*) }`
  var externCText = ''
  var line
  var i = 0
  while (i < lines.length) {
    line = lines[i]
    i++
    if (line === 'extern "C" {') {
      line = lines[i]
      while (line !== '}' && i < lines.length) {
        externCText += line + '\n'
        i++
        line = lines[i]
      }
    }
  }

  var externCLines = externCText.split('\n')
  var docs = ''
  var externFn = ''
  var functions = []
  i = 0
  while (i < externCLines.length) {
    line = externCLines[i]
    i++
    while (/^\/\//.test(line)) {
      docs += line.replace(/^\/\/+/, '').trim() + '\n'
      line = externCLines[i]
      i++
    }
    if (/^extern/.test(line)) {
      while (i < externCLines.length) {
        if (/^\/\//.test(line)) {
          break
        }
        if (/;$/.test(line)) {
          externFn += line + ' '
          break
        }
        externFn += line + ' '
        line = externCLines[i]
        i++
      }
      functions.push({
        docs: docs.trim(),
        externFn: externFn.replace(/\s+/, ' ').trim()
      })
      docs = ''
      externFn = ''
    }
  }
  functions.forEach(function (fn) {
    var m = /^extern (indy_error_t) (\w+) ?\((.*\));$/.exec(fn.externFn)
    if (!m) {
      throw new Error('Unexpected function line: ' + fn.externFn)
    }
    api.functions[m[2]] = {
      docs: fn.docs,
      group: group,
      params: parseParams(m[3]),
      ret: m[1]
    }
  })
}

// parse a function params string until it hits the closing ")"
function parseParams (src) {
  var params = []
  var buff = ''

  var push = function () {
    buff = buff.trim()
    if (buff.length === 0) {
      return
    }
    if (/\(|\)/.test(buff)) {
      throw new Error('Unexpected param buffer: ' + buff)
    }
    var i = buff.lastIndexOf(' ')
    var o = {
      name: buff.substring(i).trim(),
      type: buff.substring(0, i).replace(/ \*$/, '*')
    }
    if (/json/i.test(o.name)) {
      o.json = true
    }
    params.push(o)
    buff = ''
  }

  var o
  var c
  var i = 0
  while (i < src.length) {
    c = src[i]
    if (c === ',') {
      push()
    } else if (c === ')' && !/^ *(void|indy_error_t) *\(/i.test(buff)) {
      break
    } else {
      buff += c
    }
    var m = /^ *(void|indy_error_t) *\( *\*([^)]+)\) *\(/i.exec(buff)
    if (m) {
      o = {
        name: m[2],
        params: parseParams(src.substr(i + 1)),
        ret: m[1]
      }
      if (o.ret === 'void') {
        delete o.ret
      }
      params.push(o)
      buff = ''
      break
    }
    i++
  }
  push()
  return params
}

// now parse the error codes
fs.readFileSync(path.resolve(__dirname, '../../../libindy/include/indy_mod.h'), 'utf8')
  .split('\n')
  .map(function (line) {
    return line
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^#.*$/g, '')
      .replace(/\/\/.*$/g, '')
      .replace(/\s+/g, ' ')
      .replace(/,/g, '')
      .trim()
  })
  .filter(function (line) {
    return line.length > 0
  })
  .slice(3, -1)
  .map(function (line) {
    return line.split('=').map(part => part.trim()).reverse()
  })
  .forEach(function (pair) {
    api.errors['c' + pair[0]] = pair[1]
  })

fs.writeFileSync(path.resolve(__dirname, 'api.json'), stringify(api, {maxLength: 100}), 'utf8')
