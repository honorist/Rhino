var fs = require('fs');
var c = fs.readFileSync('js/views/ContasPagar.js', 'utf8');
var d = 0;
var lines = c.split('\n');
var BACKSLASH = 92;
for (var i = 0; i < lines.length; i++) {
  var ln = lines[i];
  for (var j = 0; j < ln.length; j++) {
    var ch = ln.charCodeAt(j);
    var prev = j > 0 ? ln.charCodeAt(j-1) : 0;
    if (ch === 96 && prev !== BACKSLASH) {
      if (d > 0) { d--; } else { d++; }
      var ctx = ln.substring(Math.max(0,j-8), j+8);
      console.log('L' + (i+1) + ' d=' + d + ' ctx:[' + ctx + ']');
    }
  }
}
console.log('final d=' + d);
