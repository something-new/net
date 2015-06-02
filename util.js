var lang = require("lively.lang");

function selectKeys(obj, keys) {
  var result = {};
  keys.forEach(function(k) { result[k] = obj[k]; });
  return result;
}

function dissoc(obj, key) {
  var result = lang.obj.clone(obj);
  delete result[key];
  return result;
}

function assoc(obj, key, value) {
  var result = lang.obj.clone(obj);
  result[key] = value;
  return result;
}

function uniq(array, sorted) {
  return array.reduce(function(a, value, index) {
    if (0 === index || (sorted ? a.slice(-1)[0] != value : a.indexOf(value) === -1))
      a.push(value);
    return a;
  }, []);
}

function keyForValue(obj, val) {
  for (var name in obj) {
    if (obj[name] === val) return name;
  }
  return null;
}

module.exports = {
  selectKeys:  selectKeys,
  dissoc:      dissoc,
  assoc:       assoc,
  uniq:        uniq,
  merge:       lang.obj.merge,
  keyForValue: keyForValue
}
