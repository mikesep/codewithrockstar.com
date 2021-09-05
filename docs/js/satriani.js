(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.Satriani = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
module.exports = {
    Environment: Environment,
    eq: eq
}

const MYSTERIOUS = '__MYSTERIOUS__';

function Environment(parent) {
    this.vars = Object.create(parent ? parent.vars : null);
    this.parent = parent;
    this.output = (parent && parent.output ? parent.output : console.log);
    // Because nodeJS is based on asynchronous IO, there is no built-in console.readline or similar
    // so by default, any input will yield an empty string.
    this.input = (parent && parent.input ? parent.input : () => "")
}

Environment.prototype = {
    extend: function () { return new Environment(this) },

    exists: function (name) {
        return (name in this.vars);
    },

    lookup: function (name, index, force_array) {
        if (name in this.vars) {
            let variable = this.vars[name];
            if (Array.isArray(variable)) {
                if (typeof (index) == 'undefined' || index == null) {
                    if (force_array || this.FORCE_ARRAY_FLAG) {
                        this.FORCE_ARRAY_FLAG = false;
                        return variable;
                    }
                    return (variable.length);
                }
                return variable[index];
            }
            if (typeof (variable) == 'string' && typeof (index) == 'number') return (variable[index]);
            return variable;
        }
        throw new Error("Undefined variable " + name);
    },

    assign: function (name, value, index, local) {
        let container = (!local && typeof (value) != "function" && this.parent && name in this.parent.vars) ? this.parent.vars : this.vars;
        if (typeof (index) == 'undefined' || index == null) return container[name] = value;
        if (name in container) {
            if (!Array.isArray(container[name])) throw new Error(`Can't assign ${name} at ${index} - ${name} is not an indexed variable.`);
        } else {
            container[name] = new Array();
        }
        return container[name][index] = value;
    },

    run: function (program) {
        let result = evaluate(program, this);
        return (result ? result.value : undefined);
    },

    dealias: function (expr) {
        if (expr.variable.pronoun) return this.pronoun_alias;
        return (expr.variable);
    },

    pronoun_alias: null,
}

function evaluate(tree, env) {
    if (tree == MYSTERIOUS || typeof (tree) == 'undefined') return undefined;
    if (tree == null) return null;
    let list = Object.entries(tree)
    for (let i = 0; i < list.length; i++) {
        let node = list[i];
        let type = node[0];
        let expr = node[1];
        switch (type) {
            case "action": return (tree);
            case "list":
                let result = null;
                for (let i = 0; i < expr.length; i++) {
                    let next = expr[i];
                    result = evaluate(next, env);
                    if (result && result.action) return (result);
                }
                return result;
            case "conditional":
                if (evaluate(expr.condition, env)) {
                    return evaluate(expr.consequent, env);
                } else if (expr.alternate) {
                    return evaluate(expr.alternate, env);
                }
                return;
            case 'break':
                return { 'action': 'break' };
            case 'continue':
                return { 'action': 'continue' };
            case "return":
                return { 'action': 'return', 'value': evaluate(expr.expression, env) };
            case "number":
            case "string":
            case "constant":
                return (expr);
            case "output":
                let printable = evaluate(expr, env); 2
                if (typeof (printable) == 'undefined') printable = "mysterious";
                env.output(printable);
                return;
            case "listen":
                return env.input();
            case "binary":
                return binary(expr, env);
            case "lookup":
                return lookup(expr, env);
            case "assign":
                return assign(expr, env);
            case "pronoun":
                return env.lookup(env.pronoun_alias);
            case "blank":
                return;
            case "rounding":
                return rounding(expr, env);
            case "mutation":
                return mutation(expr, env);
            case "increment":
                let increment_name = env.dealias(expr);
                let old_increment_value = env.lookup(increment_name);
                switch (typeof (old_increment_value)) {
                    case "boolean":
                        if (expr.multiple % 2 != 0) env.assign(increment_name, !old_increment_value);
                        return;
                    default:
                        env.assign(increment_name, (old_increment_value + expr.multiple));
                        return;
                }
            case "decrement":
                let decrement_name = env.dealias(expr);
                let old_decrement_value = env.lookup(decrement_name);
                switch (typeof (old_decrement_value)) {
                    case "boolean":
                        if (expr.multiple % 2 != 0) env.assign(decrement_name, !old_decrement_value);
                        return;
                    default:
                        env.assign(decrement_name, (old_decrement_value - expr.multiple));
                        return;
                }
            case "while_loop":
                while_outer: while (evaluate(expr.condition, env)) {
                    let result = evaluate(expr.consequent, env);
                    if (result) switch (result.action) {
                        case 'continue':
                            continue while_outer;
                        case 'break':
                            break while_outer;
                        case 'return':
                            return (result);
                    }
                }
                return;
            case "until_loop":
                until_outer: while (!evaluate(expr.condition, env)) {
                    let result = evaluate(expr.consequent, env);
                    if (result) switch (result.action) {
                        case 'continue':
                            continue until_outer;
                        case 'break':
                            break until_outer;
                        case 'return':
                            return (result);
                    }
                }
                return;
            case "comparison":
                let lhs = evaluate(expr.lhs, env);
                let rhs = evaluate(expr.rhs, env);
                switch (expr.comparator) {
                    case "eq":
                        return eq(lhs, rhs);
                    case "ne":
                        return !eq(lhs, rhs);
                    case "lt":
                        return (lhs < rhs);
                    case "le":
                        return (lhs <= rhs);
                    case "ge":
                        return (lhs >= rhs);
                    case "gt":
                        return (lhs > rhs);
                    default:
                        throw new Error(`Unknown comparison operator ${expr.comparator}`);
                }
            case "not":
                return (!evaluate(expr.expression, env));
            case "function":
                env.assign(expr.name, make_lambda(expr, env));
                return;
            case "call":
                let func = env.lookup(expr.name);
                let func_result = func.apply(null, expr.args.map(arg => {
                    env.FORCE_ARRAY_FLAG = true;
                    let value =  evaluate(arg, env);
                    // If the arg is an array, we shallow-copy it when passing it to a function call
                    return (value && value.map ? value.map(e => e) : value);                
                }));
                return (func_result ? func_result.value : undefined);
            case "enlist":
                return enlist(expr, env);
            case "delist":
                return delist(expr, env);
            default:
                if (Array.isArray(tree) && tree.length == 1) return (evaluate(tree[0], env));
                throw new Error("Sorry - I don't know how to evaluate this: " + JSON.stringify(tree))
        }
    }
}

function mutation(expr, env) {
    let source = evaluate(expr.source, env);
    let modifier = evaluate(expr.modifier, env);
    switch (expr.type) {
        case "split":
            return source.toString().split(modifier || "");
        case "cast":
            if (typeof (source) == 'string') return parseInt(source, modifier);
            if (typeof (source) == 'number') return String.fromCharCode(source);
            throw new Error(`I don't know how to cast ${source}`);
        case "join":
            // This is a nasty hack but it avoids having to extend the entire
            // parser with a special additional parameter.
            env.FORCE_ARRAY_FLAG = true;
            source = evaluate(expr.source, env);
            if (Array.isArray(source)) {
                let joiner = (typeof (modifier) == 'undefined' || modifier == null) ? '' : modifier;
                return source.join(joiner);
            }
            throw new Error("I don't know how to join that.");
    }
}

function lookup(expr, env) {
    let lookup_name = env.dealias(expr);
    let index = evaluate(expr.index, env);
    return env.lookup(lookup_name, index);
}

function assign(expr, env) {
    let target = expr.target;
    let index = evaluate(target.index, env);
    let alias = (target.variable.pronoun ? env.pronoun_alias : target.variable);
    let value = evaluate(expr.expression, env);
    env.assign(alias, value, index);
    if (!target.variable.pronoun) env.pronoun_alias = alias;
    return value;
}

function enlist(expr, env) {

    let array_value;
    let array_name = env.dealias(expr);

    if (env.exists(array_name)) {
        array_value = env.lookup(array_name, null, true);
        if (!Array.isArray(array_value)) array_value = [array_value];
    } else {
        array_value = [];
    }
    if (expr.expression) {
        let elements_to_enlist = (expr.expression.map ? expr.expression : [expr.expression]);
        array_value = array_value.concat(elements_to_enlist.map(e => evaluate(e, env)));
    }
    env.assign(array_name, array_value);
    return array_value;

    // let alias = "";
    // let target = expr.target;
    // let index = evaluate(target.index, env);
    // if (target.variable.pronoun) {
    //     alias = env.pronoun_alias;
    // } else {
    //     alias = target.variable;
    //     env.pronoun_alias = alias;
    // }

    // let value;
    // if (env.exists(alias)) {
    //     value = env.lookup(alias);
    //     if (!Array.isArray(value)) value = [value];
    // } else {
    //     value = [];
    // }
    // if (expr.expression) {
    //     let values = (expr.expression.map ? expr.expression : [expr.expression]);
    //     value = value.concat(values.map(e => evaluate(e, env)));
    // }
    // env.assign(alias, value, index);
    // return value;
}

function delist(expr, env) {
    let name = env.dealias(expr);
    let source = env.lookup(name, null, "FIST")
    let result = (source.shift && source.shift());
    return result;
}

function rounding(expr, env) {
    let variable_name = env.dealias(expr);
    let variable_value = env.lookup(variable_name);
    switch (expr.direction) {
        case "up":
            return env.assign(variable_name, Math.ceil(variable_value));
        case "down":
            return env.assign(variable_name, Math.floor(variable_value));
        default:
            return env.assign(variable_name, Math.round(variable_value));
    }
}

function demystify(expr, env) {
    let result = evaluate(expr, env);
    if (typeof (result) == 'undefined') return ('mysterious');
    return (result);
}

function eq(lhs, rhs) {
    if (Array.isArray(lhs)) return (eq_array(lhs, rhs));
    if (Array.isArray(rhs)) return (eq_array(rhs, lhs));

    if (is_nothing(lhs) && is_nothing(rhs)) return (true);
    // if (typeof (lhs) == 'undefined') return (typeof (rhs) == 'undefined');
    // if (typeof (rhs) == 'undefined') return (typeof (lhs) == 'undefined');

    if (typeof (lhs) == 'boolean') return (eq_boolean(lhs, rhs));
    if (typeof (rhs) == 'boolean') return (eq_boolean(rhs, lhs));

    if (typeof (lhs) == 'number') return (eq_number(lhs, rhs));
    if (typeof (rhs) == 'number') return (eq_number(rhs, lhs));

    if (typeof (lhs) == 'string') return (eq_string(lhs, rhs));
    if (typeof (rhs) == 'string') return (eq_string(rhs, lhs));

    return lhs == rhs;
}

function is_nothing(thing) {
    return (
        typeof (thing) == 'undefined'
        ||
        thing === null
        ||
        thing === ""
        ||
        thing == 0
        ||
        thing == false
    );
}

function eq_array(array, other) {
    if (Array.isArray(other)) return ((array.length == other.length) && array.every((el, ix) => el === other[index]));
    if (other == null || other == 0 || other == "") return (array.length == 0);
    return (false);
}

function eq_string(string, other) {
    if (other == null || typeof (other) == 'undefined') return (string === "");
    return (other == string);
}

function eq_number(number, other) {
    if (other == null || typeof (other) == 'undefined') return (number === 0);
    return (other == number);
}

function eq_boolean(bool, other) {
    // false equals null in Rockstar
    if (other == null) other = false;
    // false equals zero in Rockstar
    if (typeof (other) == 'number') other = (other !== 0);
    if (typeof (other) == 'string') other = (other !== "");
    return (bool == other);
}

function make_lambda(expr, env) {
    function lambda() {
        let names = expr.args;
        if (names.length != arguments.length) throw ('Wrong number of arguments supplied to function ' + expr.name + ' (' + expr.args + ')');
        let scope = env.extend();
        for (let i = 0; i < names.length; ++i) scope.assign(names[i], arguments[i], null, 1)
        return evaluate(expr.body, scope);
    }

    return lambda;
}

function binary(b, env) {
    switch (b.op) {
        case "and": return (evaluate(b.lhs, env) && evaluate(b.rhs, env));
        case "nor": return (!evaluate(b.lhs, env) && !evaluate(b.rhs, env));
        case "or": return (evaluate(b.lhs, env) || evaluate(b.rhs, env));
        case '+': return add(b.lhs, b.rhs, env);
        case '-': return subtract(b.lhs, b.rhs, env);
        case '/': return divide(b.lhs, b.rhs, env);
        case '*': return multiply(b.lhs, b.rhs, env);
    }
}

function add(lhs, rhs, env) {
    return (rhs.reduce ? rhs : [rhs]).reduce((acc, val) => acc += demystify(val, env), demystify(lhs, env));
}

function subtract(lhs, rhs, env) {
    return (rhs.reduce ? rhs : [rhs]).reduce((acc, val) => acc -= evaluate(val, env), evaluate(lhs, env));
}

function divide(lhs, rhs, env) {
    return (rhs.reduce ? rhs : [rhs]).reduce((acc, val) => acc /= evaluate(val, env), evaluate(lhs, env));
}

function multiply(lhs, rhs, env) {
    return (rhs.reduce ? rhs : [rhs])
        .map(expr => evaluate(expr, env))
        .reduce(multiply_reduce, evaluate(lhs, env));
}

function multiply_reduce(acc, val, idx, src) {
    // Null, nothing, noone, nowhere, etc. are all zero for multiplication purposes.
    if (acc == null) acc = 0;
    if (val == null) val = 0;
    // Mu ltiplying numbers just works.
    if (typeof (acc) == 'number' && typeof (val) == 'number') return (acc * val);
    // Multiplying strings by numbers does repeated concatenation
    if (typeof (acc) == 'string' && typeof (val) == 'number') return multiply_string(acc, val);
    if (typeof (acc) == 'number' && typeof (val) == 'string') return multiply_string(val, acc);
}

function multiply_string(s, n) {
    let result = Array();
    while (--n >= 0) result.push(s);
    return (result.join(''));
}

},{}],2:[function(require,module,exports){
const parser = require('./satriani.parser.js');
const interpreter = require('./satriani.interpreter.js');

module.exports = {
    Interpreter : function() {
        this.run = function(program, input, output) {
            if (typeof(program) == 'string') program = this.parse(program);
            let env = new interpreter.Environment();
            env.output = output || console.log;
            env.input = input || (() => "");
            return env.run(program);
        }

        this.parse = function(program) {
            return parser.parse(program);
        }
    }
};

},{"./satriani.interpreter.js":1,"./satriani.parser.js":3}],3:[function(require,module,exports){
/*
 * Generated by PEG.js 0.10.0.
 *
 * http://pegjs.org/
 */

"use strict";

function peg$subclass(child, parent) {
  function ctor() { this.constructor = child; }
  ctor.prototype = parent.prototype;
  child.prototype = new ctor();
}

function peg$SyntaxError(message, expected, found, location) {
  this.message  = message;
  this.expected = expected;
  this.found    = found;
  this.location = location;
  this.name     = "SyntaxError";

  if (typeof Error.captureStackTrace === "function") {
    Error.captureStackTrace(this, peg$SyntaxError);
  }
}

peg$subclass(peg$SyntaxError, Error);

peg$SyntaxError.buildMessage = function(expected, found) {
  var DESCRIBE_EXPECTATION_FNS = {
        literal: function(expectation) {
          return "\"" + literalEscape(expectation.text) + "\"";
        },

        "class": function(expectation) {
          var escapedParts = "",
              i;

          for (i = 0; i < expectation.parts.length; i++) {
            escapedParts += expectation.parts[i] instanceof Array
              ? classEscape(expectation.parts[i][0]) + "-" + classEscape(expectation.parts[i][1])
              : classEscape(expectation.parts[i]);
          }

          return "[" + (expectation.inverted ? "^" : "") + escapedParts + "]";
        },

        any: function(expectation) {
          return "any character";
        },

        end: function(expectation) {
          return "end of input";
        },

        other: function(expectation) {
          return expectation.description;
        }
      };

  function hex(ch) {
    return ch.charCodeAt(0).toString(16).toUpperCase();
  }

  function literalEscape(s) {
    return s
      .replace(/\\/g, '\\\\')
      .replace(/"/g,  '\\"')
      .replace(/\0/g, '\\0')
      .replace(/\t/g, '\\t')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/[\x00-\x0F]/g,          function(ch) { return '\\x0' + hex(ch); })
      .replace(/[\x10-\x1F\x7F-\x9F]/g, function(ch) { return '\\x'  + hex(ch); });
  }

  function classEscape(s) {
    return s
      .replace(/\\/g, '\\\\')
      .replace(/\]/g, '\\]')
      .replace(/\^/g, '\\^')
      .replace(/-/g,  '\\-')
      .replace(/\0/g, '\\0')
      .replace(/\t/g, '\\t')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/[\x00-\x0F]/g,          function(ch) { return '\\x0' + hex(ch); })
      .replace(/[\x10-\x1F\x7F-\x9F]/g, function(ch) { return '\\x'  + hex(ch); });
  }

  function describeExpectation(expectation) {
    return DESCRIBE_EXPECTATION_FNS[expectation.type](expectation);
  }

  function describeExpected(expected) {
    var descriptions = new Array(expected.length),
        i, j;

    for (i = 0; i < expected.length; i++) {
      descriptions[i] = describeExpectation(expected[i]);
    }

    descriptions.sort();

    if (descriptions.length > 0) {
      for (i = 1, j = 1; i < descriptions.length; i++) {
        if (descriptions[i - 1] !== descriptions[i]) {
          descriptions[j] = descriptions[i];
          j++;
        }
      }
      descriptions.length = j;
    }

    switch (descriptions.length) {
      case 1:
        return descriptions[0];

      case 2:
        return descriptions[0] + " or " + descriptions[1];

      default:
        return descriptions.slice(0, -1).join(", ")
          + ", or "
          + descriptions[descriptions.length - 1];
    }
  }

  function describeFound(found) {
    return found ? "\"" + literalEscape(found) + "\"" : "end of input";
  }

  return "Expected " + describeExpected(expected) + " but " + describeFound(found) + " found.";
};

function peg$parse(input, options) {
  options = options !== void 0 ? options : {};

  var peg$FAILED = {},

      peg$startRuleFunctions = { program: peg$parseprogram },
      peg$startRuleFunction  = peg$parseprogram,

      peg$c0 = function(p) { return { list: p.filter(item => item) } },
      peg$c1 = function(s) { return s },
      peg$c2 = function() { return null },
      peg$c3 = /^[ \t]/,
      peg$c4 = peg$classExpectation([" ", "\t"], false, false),
      peg$c5 = "(",
      peg$c6 = peg$literalExpectation("(", false),
      peg$c7 = /^[^)]/,
      peg$c8 = peg$classExpectation([")"], true, false),
      peg$c9 = ")",
      peg$c10 = peg$literalExpectation(")", false),
      peg$c11 = /^[;,?!&.]/,
      peg$c12 = peg$classExpectation([";", ",", "?", "!", "&", "."], false, false),
      peg$c13 = "\r",
      peg$c14 = peg$literalExpectation("\r", false),
      peg$c15 = "\n",
      peg$c16 = peg$literalExpectation("\n", false),
      peg$c17 = peg$anyExpectation(),
      peg$c18 = /^[^\n]/,
      peg$c19 = peg$classExpectation(["\n"], true, false),
      peg$c20 = "break",
      peg$c21 = peg$literalExpectation("break", true),
      peg$c22 = function() {
      	return { 'break' : {} }
      },
      peg$c23 = "continue",
      peg$c24 = peg$literalExpectation("continue", true),
      peg$c25 = "take it to the top",
      peg$c26 = peg$literalExpectation("take it to the top", true),
      peg$c27 = function() {
      	return { 'continue' : {} }
      },
      peg$c28 = "takes",
      peg$c29 = peg$literalExpectation("takes", true),
      peg$c30 = "wants",
      peg$c31 = peg$literalExpectation("wants", true),
      peg$c32 = function(name, args, body) { return { 'function': {
          	name: name,
              args: args.map(arg => arg),
              body: body
          } } },
      peg$c33 = ", and",
      peg$c34 = peg$literalExpectation(", and", false),
      peg$c35 = "&",
      peg$c36 = peg$literalExpectation("&", false),
      peg$c37 = ",",
      peg$c38 = peg$literalExpectation(",", false),
      peg$c39 = "'n'",
      peg$c40 = peg$literalExpectation("'n'", false),
      peg$c41 = "and",
      peg$c42 = peg$literalExpectation("and", false),
      peg$c43 = function(head, tail) { return [head].concat(tail) },
      peg$c44 = function(arg) { return [arg] },
      peg$c45 = "taking",
      peg$c46 = peg$literalExpectation("taking", true),
      peg$c47 = function(name, args) { return { 'call': { name: name, args: Array.isArray(args) ? args : [args] } } },
      peg$c48 = "return",
      peg$c49 = peg$literalExpectation("return", true),
      peg$c50 = "give back",
      peg$c51 = peg$literalExpectation("give back", true),
      peg$c52 = "send",
      peg$c53 = peg$literalExpectation("send", true),
      peg$c54 = "give",
      peg$c55 = peg$literalExpectation("give", true),
      peg$c56 = "back",
      peg$c57 = peg$literalExpectation("back", true),
      peg$c58 = function(e) { return { 'return': { 'expression' : e } } },
      peg$c59 = "listen to",
      peg$c60 = peg$literalExpectation("listen to", true),
      peg$c61 = function(target) { return { assign: { expression: { listen : ''}, target: target } } },
      peg$c62 = "listen",
      peg$c63 = peg$literalExpectation("listen", true),
      peg$c64 = function() { return { 'listen' : ''} },
      peg$c65 = function(head, tail) {
                return { list : [head].concat(tail) }
              },
      peg$c66 = "else",
      peg$c67 = peg$literalExpectation("else", true),
      peg$c68 = function(a) { return a },
      peg$c69 = "if",
      peg$c70 = peg$literalExpectation("if", true),
      peg$c71 = function(e, c, a) {
                return {
                    'conditional': {
                        'condition' : e,
                          'consequent' : c,
                          'alternate' : a
                      }
                  };
              },
      peg$c72 = "while",
      peg$c73 = peg$literalExpectation("while", true),
      peg$c74 = function(e, c) { return { 'while_loop': {
                  'condition': e,
                  'consequent': c
               } }; },
      peg$c75 = "until",
      peg$c76 = peg$literalExpectation("until", true),
      peg$c77 = function(e, c) { return { 'until_loop': {
                  'condition': e,
                  'consequent': c
               } }; },
      peg$c78 = "say",
      peg$c79 = peg$literalExpectation("say", true),
      peg$c80 = "shout",
      peg$c81 = peg$literalExpectation("shout", true),
      peg$c82 = "whisper",
      peg$c83 = peg$literalExpectation("whisper", true),
      peg$c84 = "scream",
      peg$c85 = peg$literalExpectation("scream", true),
      peg$c86 = function(e) {return {'output': e}},
      peg$c87 = "true",
      peg$c88 = peg$literalExpectation("true", true),
      peg$c89 = "ok",
      peg$c90 = peg$literalExpectation("ok", true),
      peg$c91 = "right",
      peg$c92 = peg$literalExpectation("right", true),
      peg$c93 = "yes",
      peg$c94 = peg$literalExpectation("yes", true),
      peg$c95 = function() { return { constant: true } },
      peg$c96 = "false",
      peg$c97 = peg$literalExpectation("false", true),
      peg$c98 = "lies",
      peg$c99 = peg$literalExpectation("lies", true),
      peg$c100 = "wrong",
      peg$c101 = peg$literalExpectation("wrong", true),
      peg$c102 = "no",
      peg$c103 = peg$literalExpectation("no", true),
      peg$c104 = function() { return { constant: false } },
      peg$c105 = "null",
      peg$c106 = peg$literalExpectation("null", true),
      peg$c107 = "nothing",
      peg$c108 = peg$literalExpectation("nothing", true),
      peg$c109 = "nowhere",
      peg$c110 = peg$literalExpectation("nowhere", true),
      peg$c111 = "nobody",
      peg$c112 = peg$literalExpectation("nobody", true),
      peg$c113 = "gone",
      peg$c114 = peg$literalExpectation("gone", true),
      peg$c115 = function() { return { constant: null } },
      peg$c116 = "empty",
      peg$c117 = peg$literalExpectation("empty", true),
      peg$c118 = "silent",
      peg$c119 = peg$literalExpectation("silent", true),
      peg$c120 = "silence",
      peg$c121 = peg$literalExpectation("silence", true),
      peg$c122 = function() { return { constant: "" } },
      peg$c123 = "mysterious",
      peg$c124 = peg$literalExpectation("mysterious", false),
      peg$c125 = function() { return '__MYSTERIOUS__' },
      peg$c126 = "-",
      peg$c127 = peg$literalExpectation("-", false),
      peg$c128 = /^[0-9]/,
      peg$c129 = peg$classExpectation([["0", "9"]], false, false),
      peg$c130 = ".",
      peg$c131 = peg$literalExpectation(".", false),
      peg$c132 = function(n) { return {number: parseFloat(n)} },
      peg$c133 = function(n) { return {number: parseFloat(n) } },
      peg$c134 = "\"",
      peg$c135 = peg$literalExpectation("\"", false),
      peg$c136 = /^[^"]/,
      peg$c137 = peg$classExpectation(["\""], true, false),
      peg$c138 = function(s) { return {string: s}},
      peg$c139 = "nor",
      peg$c140 = peg$literalExpectation("nor", false),
      peg$c141 = function(lhs, rhs) {
      	return { 'binary' : { op: 'nor', lhs: lhs, rhs: rhs } } },
      peg$c142 = "or",
      peg$c143 = peg$literalExpectation("or", false),
      peg$c144 = function(lhs, rhs) {
      	return { 'binary': {
              op: 'or',
              lhs: lhs,
              rhs: rhs
          } }
       },
      peg$c145 = function(lhs, rhs) {
      	return { 'binary': {
              op: 'and',
              lhs: lhs,
              rhs: rhs
          } }
       },
      peg$c146 = "aint",
      peg$c147 = peg$literalExpectation("aint", true),
      peg$c148 = "ain't",
      peg$c149 = peg$literalExpectation("ain't", true),
      peg$c150 = "isnt",
      peg$c151 = peg$literalExpectation("isnt", true),
      peg$c152 = "isn't",
      peg$c153 = peg$literalExpectation("isn't", true),
      peg$c154 = function() { return 'ne' },
      peg$c155 = "is",
      peg$c156 = peg$literalExpectation("is", true),
      peg$c157 = function() { return 'eq' },
      peg$c158 = function(lhs, c, rhs) {
            return {
                comparison: {
                    comparator: c,
                      lhs: lhs,
                      rhs: rhs
                  }
              };
          },
      peg$c159 = "not",
      peg$c160 = peg$literalExpectation("not", false),
      peg$c161 = function(e) { return { 'not': { expression: e} } },
      peg$c162 = "higher",
      peg$c163 = peg$literalExpectation("higher", true),
      peg$c164 = "greater",
      peg$c165 = peg$literalExpectation("greater", true),
      peg$c166 = "bigger",
      peg$c167 = peg$literalExpectation("bigger", true),
      peg$c168 = "stronger",
      peg$c169 = peg$literalExpectation("stronger", true),
      peg$c170 = "lower",
      peg$c171 = peg$literalExpectation("lower", true),
      peg$c172 = "less",
      peg$c173 = peg$literalExpectation("less", true),
      peg$c174 = "smaller",
      peg$c175 = peg$literalExpectation("smaller", true),
      peg$c176 = "weaker",
      peg$c177 = peg$literalExpectation("weaker", true),
      peg$c178 = "high",
      peg$c179 = peg$literalExpectation("high", true),
      peg$c180 = "great",
      peg$c181 = peg$literalExpectation("great", true),
      peg$c182 = "big",
      peg$c183 = peg$literalExpectation("big", true),
      peg$c184 = "strong",
      peg$c185 = peg$literalExpectation("strong", true),
      peg$c186 = "low",
      peg$c187 = peg$literalExpectation("low", true),
      peg$c188 = "little",
      peg$c189 = peg$literalExpectation("little", true),
      peg$c190 = "small",
      peg$c191 = peg$literalExpectation("small", true),
      peg$c192 = "weak",
      peg$c193 = peg$literalExpectation("weak", true),
      peg$c194 = "than",
      peg$c195 = peg$literalExpectation("than", true),
      peg$c196 = function() { return 'gt' },
      peg$c197 = function() { return 'lt' },
      peg$c198 = "as",
      peg$c199 = peg$literalExpectation("as", true),
      peg$c200 = function() { return 'ge' },
      peg$c201 = function() { return 'le' },
      peg$c202 = function(first, rest) { return rest.reduce(function(memo, curr) {
                            return { binary: { op: curr[0], lhs: memo, rhs: curr[1]} };
                      }, first); },
      peg$c203 = function(first, rest) { return rest.reduce(function(memo, curr) {
                          return { binary: { op: curr[0], lhs: memo, rhs: curr[1]} };
                      }, first); },
      peg$c204 = "+",
      peg$c205 = peg$literalExpectation("+", false),
      peg$c206 = "plus ",
      peg$c207 = peg$literalExpectation("plus ", false),
      peg$c208 = "with ",
      peg$c209 = peg$literalExpectation("with ", false),
      peg$c210 = function() { return '+' },
      peg$c211 = "minus ",
      peg$c212 = peg$literalExpectation("minus ", false),
      peg$c213 = "without ",
      peg$c214 = peg$literalExpectation("without ", false),
      peg$c215 = function() { return '-' },
      peg$c216 = "*",
      peg$c217 = peg$literalExpectation("*", false),
      peg$c218 = "times ",
      peg$c219 = peg$literalExpectation("times ", false),
      peg$c220 = "of ",
      peg$c221 = peg$literalExpectation("of ", false),
      peg$c222 = function() { return '*' },
      peg$c223 = "/",
      peg$c224 = peg$literalExpectation("/", false),
      peg$c225 = "over ",
      peg$c226 = peg$literalExpectation("over ", false),
      peg$c227 = "between ",
      peg$c228 = peg$literalExpectation("between ", false),
      peg$c229 = function() { return '/' },
      peg$c230 = "they",
      peg$c231 = peg$literalExpectation("they", true),
      peg$c232 = "them",
      peg$c233 = peg$literalExpectation("them", true),
      peg$c234 = "she",
      peg$c235 = peg$literalExpectation("she", true),
      peg$c236 = "him",
      peg$c237 = peg$literalExpectation("him", true),
      peg$c238 = "her",
      peg$c239 = peg$literalExpectation("her", true),
      peg$c240 = "hir",
      peg$c241 = peg$literalExpectation("hir", true),
      peg$c242 = "zie",
      peg$c243 = peg$literalExpectation("zie", true),
      peg$c244 = "zir",
      peg$c245 = peg$literalExpectation("zir", true),
      peg$c246 = "xem",
      peg$c247 = peg$literalExpectation("xem", true),
      peg$c248 = "ver",
      peg$c249 = peg$literalExpectation("ver", true),
      peg$c250 = "ze",
      peg$c251 = peg$literalExpectation("ze", true),
      peg$c252 = "ve",
      peg$c253 = peg$literalExpectation("ve", true),
      peg$c254 = "xe",
      peg$c255 = peg$literalExpectation("xe", true),
      peg$c256 = "it",
      peg$c257 = peg$literalExpectation("it", true),
      peg$c258 = "he",
      peg$c259 = peg$literalExpectation("he", true),
      peg$c260 = function(pronoun) { return { pronoun: pronoun.toLowerCase() } },
      peg$c261 = "an",
      peg$c262 = peg$literalExpectation("an", true),
      peg$c263 = "a",
      peg$c264 = peg$literalExpectation("a", true),
      peg$c265 = "the",
      peg$c266 = peg$literalExpectation("the", true),
      peg$c267 = "my",
      peg$c268 = peg$literalExpectation("my", true),
      peg$c269 = "your",
      peg$c270 = peg$literalExpectation("your", true),
      peg$c271 = /^[A-Z\xC0\xC1\xC2\xC3\xC4\xC5\xC6\xC7\xC8\xC9\xCA\xCB\xCC\xCD\xCE\xCF\xD0\xD1\xD2\xD3\xD4\xD5\xD6\xD8\xD9\xDA\xDB\xDC\xDD\xDE\u0100\u0102\u0104\u0106\u0108\u010A\u010C\u010E\u0110\u0112\u0114\u0116\u0118\u011A\u011C\u011E\u0120\u0122\u0124\u0126\u0128\u012A\u012C\u012E\u0130\u0132\u0134\u0136\u0138\u0139\u013B\u013D\u013F\u0141\u0143\u0145\u0147\u014A\u014C\u014E\u0150\u0152\u0154\u0156\u0158\u015A\u015C\u015E\u0160\u0162\u0164\u0166\u0168\u016A\u016C\u016E\u0170\u0172\u0174\u0176\u0178\u0179\u017B\u017D]/,
      peg$c272 = peg$classExpectation([["A", "Z"], "\xC0", "\xC1", "\xC2", "\xC3", "\xC4", "\xC5", "\xC6", "\xC7", "\xC8", "\xC9", "\xCA", "\xCB", "\xCC", "\xCD", "\xCE", "\xCF", "\xD0", "\xD1", "\xD2", "\xD3", "\xD4", "\xD5", "\xD6", "\xD8", "\xD9", "\xDA", "\xDB", "\xDC", "\xDD", "\xDE", "\u0100", "\u0102", "\u0104", "\u0106", "\u0108", "\u010A", "\u010C", "\u010E", "\u0110", "\u0112", "\u0114", "\u0116", "\u0118", "\u011A", "\u011C", "\u011E", "\u0120", "\u0122", "\u0124", "\u0126", "\u0128", "\u012A", "\u012C", "\u012E", "\u0130", "\u0132", "\u0134", "\u0136", "\u0138", "\u0139", "\u013B", "\u013D", "\u013F", "\u0141", "\u0143", "\u0145", "\u0147", "\u014A", "\u014C", "\u014E", "\u0150", "\u0152", "\u0154", "\u0156", "\u0158", "\u015A", "\u015C", "\u015E", "\u0160", "\u0162", "\u0164", "\u0166", "\u0168", "\u016A", "\u016C", "\u016E", "\u0170", "\u0172", "\u0174", "\u0176", "\u0178", "\u0179", "\u017B", "\u017D"], false, false),
      peg$c273 = /^[a-z\xE0\xE1\xE2\xE3\xE4\xE5\xE6\xE7\xE8\xE9\xEA\xEB\xEC\xED\xEE\xEF\xF0\xF1\xF2\xF3\xF4\xF5\xF6\xF8\xF9\xFA\xFB\xFC\xFD\xFE\u0101\u0103\u0105\u0107\u0109\u010B\u010D\u010F\u0111\u0113\u0115\u0117\u0119\u011B\u011D\u011F\u0121\u0123\u0125\u0127\u0129\u012B\u012D\u012F\u0131\u0133\u0135\u0137\u0138\u013A\u013C\u013E\u0140\u0142\u0144\u0146\u0148\u014B\u014D\u014F\u0151\u0153\u0155\u0157\u0159\u015B\u015D\u015F\u0161\u0163\u0165\u0167\u0169\u016B\u016D\u016F\u0171\u0173\u0175\u0177\xFF\u017A\u017C\u017E\u0149\xDF]/,
      peg$c274 = peg$classExpectation([["a", "z"], "\xE0", "\xE1", "\xE2", "\xE3", "\xE4", "\xE5", "\xE6", "\xE7", "\xE8", "\xE9", "\xEA", "\xEB", "\xEC", "\xED", "\xEE", "\xEF", "\xF0", "\xF1", "\xF2", "\xF3", "\xF4", "\xF5", "\xF6", "\xF8", "\xF9", "\xFA", "\xFB", "\xFC", "\xFD", "\xFE", "\u0101", "\u0103", "\u0105", "\u0107", "\u0109", "\u010B", "\u010D", "\u010F", "\u0111", "\u0113", "\u0115", "\u0117", "\u0119", "\u011B", "\u011D", "\u011F", "\u0121", "\u0123", "\u0125", "\u0127", "\u0129", "\u012B", "\u012D", "\u012F", "\u0131", "\u0133", "\u0135", "\u0137", "\u0138", "\u013A", "\u013C", "\u013E", "\u0140", "\u0142", "\u0144", "\u0146", "\u0148", "\u014B", "\u014D", "\u014F", "\u0151", "\u0153", "\u0155", "\u0157", "\u0159", "\u015B", "\u015D", "\u015F", "\u0161", "\u0163", "\u0165", "\u0167", "\u0169", "\u016B", "\u016D", "\u016F", "\u0171", "\u0173", "\u0175", "\u0177", "\xFF", "\u017A", "\u017C", "\u017E", "\u0149", "\xDF"], false, false),
      peg$c275 = function(prefix, name) { return (prefix + '_' + name).toLowerCase() },
      peg$c276 = "'s",
      peg$c277 = peg$literalExpectation("'s", false),
      peg$c278 = "=",
      peg$c279 = peg$literalExpectation("=", false),
      peg$c280 = "is ",
      peg$c281 = peg$literalExpectation("is ", true),
      peg$c282 = "was ",
      peg$c283 = peg$literalExpectation("was ", true),
      peg$c284 = "are ",
      peg$c285 = peg$literalExpectation("are ", true),
      peg$c286 = "were ",
      peg$c287 = peg$literalExpectation("were ", true),
      peg$c288 = "rock",
      peg$c289 = peg$literalExpectation("rock", true),
      peg$c290 = "push",
      peg$c291 = peg$literalExpectation("push", true),
      peg$c292 = "roll",
      peg$c293 = peg$literalExpectation("roll", true),
      peg$c294 = "pop",
      peg$c295 = peg$literalExpectation("pop", true),
      peg$c296 = "into",
      peg$c297 = peg$literalExpectation("into", true),
      peg$c298 = "in",
      peg$c299 = peg$literalExpectation("in", true),
      peg$c300 = function(v) { return { delist: { variable: v } }; },
      peg$c301 = function(d) { return d; },
      peg$c302 = "at",
      peg$c303 = peg$literalExpectation("at", true),
      peg$c304 = function(v, i) { return { lookup: { variable: v, index: i } }; },
      peg$c305 = function(v) { return { lookup: { variable: v } }; },
      peg$c306 = function(i) { return i },
      peg$c307 = function(v, i) { return { variable: v, index: i }; },
      peg$c308 = function(target, e) { return { assign: { target: target, expression: e} }; },
      peg$c309 = "says ",
      peg$c310 = peg$literalExpectation("says ", true),
      peg$c311 = "put",
      peg$c312 = peg$literalExpectation("put", true),
      peg$c313 = function(e, target) { return { assign: { target: target, expression: e} }; },
      peg$c314 = "let",
      peg$c315 = peg$literalExpectation("let", true),
      peg$c316 = "be",
      peg$c317 = peg$literalExpectation("be", true),
      peg$c318 = function(target, o, e) {
            return { assign: {
              target: target,
              expression: { binary: {  op: o, lhs: { lookup: target }, rhs: e } }
            } };
          },
      peg$c319 = function(t, e) { return { assign: { target: t, expression: e} }; },
      peg$c320 = function(e, v) { return { enlist: { variable: v, expression: e } }; },
      peg$c321 = "like",
      peg$c322 = peg$literalExpectation("like", true),
      peg$c323 = function(v, e) { return { enlist: { variable: v, expression: e } }; },
      peg$c324 = "with",
      peg$c325 = peg$literalExpectation("with", true),
      peg$c326 = function(v) { return { enlist: { variable: v } }; },
      peg$c327 = function(e, target) { return { assign: { target: target, expression: e } }; },
      peg$c328 = /^[^\r\n]/,
      peg$c329 = peg$classExpectation(["\r", "\n"], true, false),
      peg$c330 = function(s) { return { string: s} },
      peg$c331 = function(n, d) { return { number: parseFloat(d?n+'.'+d:n)}},
      peg$c332 = function(d) {return d},
      peg$c333 = /^[0-9',;:?!+_\/]/,
      peg$c334 = peg$classExpectation([["0", "9"], "'", ",", ";", ":", "?", "!", "+", "_", "/"], false, false),
      peg$c335 = function(head, tail) { return head + tail },
      peg$c336 = function(d) { return d },
      peg$c337 = /^[A-Za-z\-']/,
      peg$c338 = peg$classExpectation([["A", "Z"], ["a", "z"], "-", "'"], false, false),
      peg$c339 = function(t) { return (t.filter(c => /[A-Za-z\-]/.test(c)).length%10).toString()},
      peg$c340 = function(name) { return isKeyword(name) },
      peg$c341 = function(name) { return name.toLowerCase() },
      peg$c342 = function(noun) { return isKeyword(noun) },
      peg$c343 = function(noun) { return noun },
      peg$c344 = " ",
      peg$c345 = peg$literalExpectation(" ", false),
      peg$c346 = function(head) { return head.replace(/ /g, '_').toLowerCase()  },
      peg$c347 = "build",
      peg$c348 = peg$literalExpectation("build", true),
      peg$c349 = "up",
      peg$c350 = peg$literalExpectation("up", true),
      peg$c351 = function(v, t) { return {
            increment: {
                variable: v,
                  multiple: t.length
              }
          }; },
      peg$c352 = "knock",
      peg$c353 = peg$literalExpectation("knock", true),
      peg$c354 = "down",
      peg$c355 = peg$literalExpectation("down", true),
      peg$c356 = function(v, t) { return {
            decrement: {
                variable: v,
                  multiple: t.length
              }
          }; },
      peg$c357 = "cut",
      peg$c358 = peg$literalExpectation("cut", true),
      peg$c359 = "split",
      peg$c360 = peg$literalExpectation("split", true),
      peg$c361 = "shatter",
      peg$c362 = peg$literalExpectation("shatter", true),
      peg$c363 = function() { return 'split' },
      peg$c364 = "cast",
      peg$c365 = peg$literalExpectation("cast", true),
      peg$c366 = "burn",
      peg$c367 = peg$literalExpectation("burn", true),
      peg$c368 = function() { return 'cast' },
      peg$c369 = "join",
      peg$c370 = peg$literalExpectation("join", true),
      peg$c371 = "unite",
      peg$c372 = peg$literalExpectation("unite", true),
      peg$c373 = function() { return 'join' },
      peg$c374 = "using",
      peg$c375 = peg$literalExpectation("using", true),
      peg$c376 = function(m) { return m },
      peg$c377 = function(op, s, t, m) { return { assign: { target: t, expression: { mutation: { type: op, source: s, modifier: m } } } } ; },
      peg$c378 = function(op, s, m) { return { assign: { target: s, expression: { mutation: { type: op, source: { lookup: s }, modifier: m } } } } ; },
      peg$c379 = "turn",
      peg$c380 = peg$literalExpectation("turn", true),
      peg$c381 = function(v) { return { rounding: { variable: v, direction: 'down'  } }; },
      peg$c382 = function(v) { return { rounding: { variable: v, direction: 'up'  } }; },
      peg$c383 = function(v) { return { rounding: { variable: v, direction: 'up' } }; },
      peg$c384 = "round",
      peg$c385 = peg$literalExpectation("round", true),
      peg$c386 = "around",
      peg$c387 = peg$literalExpectation("around", true),
      peg$c388 = function(v) { return { rounding: { variable: v, direction: 'nearest' } }; },

      peg$currPos          = 0,
      peg$savedPos         = 0,
      peg$posDetailsCache  = [{ line: 1, column: 1 }],
      peg$maxFailPos       = 0,
      peg$maxFailExpected  = [],
      peg$silentFails      = 0,

      peg$resultsCache = {},

      peg$result;

  if ("startRule" in options) {
    if (!(options.startRule in peg$startRuleFunctions)) {
      throw new Error("Can't start parsing from rule \"" + options.startRule + "\".");
    }

    peg$startRuleFunction = peg$startRuleFunctions[options.startRule];
  }

  function text() {
    return input.substring(peg$savedPos, peg$currPos);
  }

  function location() {
    return peg$computeLocation(peg$savedPos, peg$currPos);
  }

  function expected(description, location) {
    location = location !== void 0 ? location : peg$computeLocation(peg$savedPos, peg$currPos)

    throw peg$buildStructuredError(
      [peg$otherExpectation(description)],
      input.substring(peg$savedPos, peg$currPos),
      location
    );
  }

  function error(message, location) {
    location = location !== void 0 ? location : peg$computeLocation(peg$savedPos, peg$currPos)

    throw peg$buildSimpleError(message, location);
  }

  function peg$literalExpectation(text, ignoreCase) {
    return { type: "literal", text: text, ignoreCase: ignoreCase };
  }

  function peg$classExpectation(parts, inverted, ignoreCase) {
    return { type: "class", parts: parts, inverted: inverted, ignoreCase: ignoreCase };
  }

  function peg$anyExpectation() {
    return { type: "any" };
  }

  function peg$endExpectation() {
    return { type: "end" };
  }

  function peg$otherExpectation(description) {
    return { type: "other", description: description };
  }

  function peg$computePosDetails(pos) {
    var details = peg$posDetailsCache[pos], p;

    if (details) {
      return details;
    } else {
      p = pos - 1;
      while (!peg$posDetailsCache[p]) {
        p--;
      }

      details = peg$posDetailsCache[p];
      details = {
        line:   details.line,
        column: details.column
      };

      while (p < pos) {
        if (input.charCodeAt(p) === 10) {
          details.line++;
          details.column = 1;
        } else {
          details.column++;
        }

        p++;
      }

      peg$posDetailsCache[pos] = details;
      return details;
    }
  }

  function peg$computeLocation(startPos, endPos) {
    var startPosDetails = peg$computePosDetails(startPos),
        endPosDetails   = peg$computePosDetails(endPos);

    return {
      start: {
        offset: startPos,
        line:   startPosDetails.line,
        column: startPosDetails.column
      },
      end: {
        offset: endPos,
        line:   endPosDetails.line,
        column: endPosDetails.column
      }
    };
  }

  function peg$fail(expected) {
    if (peg$currPos < peg$maxFailPos) { return; }

    if (peg$currPos > peg$maxFailPos) {
      peg$maxFailPos = peg$currPos;
      peg$maxFailExpected = [];
    }

    peg$maxFailExpected.push(expected);
  }

  function peg$buildSimpleError(message, location) {
    return new peg$SyntaxError(message, null, null, location);
  }

  function peg$buildStructuredError(expected, found, location) {
    return new peg$SyntaxError(
      peg$SyntaxError.buildMessage(expected, found),
      expected,
      found,
      location
    );
  }

  function peg$parseprogram() {
    var s0, s1, s2;

    var key    = peg$currPos * 100 + 0,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseline();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseline();
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c0(s1);
    }
    s0 = s1;

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseline() {
    var s0, s1, s2, s3, s4;

    var key    = peg$currPos * 100 + 1,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parse_();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parse_();
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parsestatement();
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseEOL();
        if (s4 !== peg$FAILED) {
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            s4 = peg$parseEOL();
          }
        } else {
          s3 = peg$FAILED;
        }
        if (s3 === peg$FAILED) {
          s3 = peg$parseEOF();
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c1(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parseEOL();
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c2();
      }
      s0 = s1;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsewhitespace() {
    var s0;

    var key    = peg$currPos * 100 + 2,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    if (peg$c3.test(input.charAt(peg$currPos))) {
      s0 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c4); }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsecomment() {
    var s0, s1, s2, s3;

    var key    = peg$currPos * 100 + 3,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 40) {
      s1 = peg$c5;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c6); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      if (peg$c7.test(input.charAt(peg$currPos))) {
        s3 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c8); }
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        if (peg$c7.test(input.charAt(peg$currPos))) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c8); }
        }
      }
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 41) {
          s3 = peg$c9;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c10); }
        }
        if (s3 !== peg$FAILED) {
          s1 = [s1, s2, s3];
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parse_() {
    var s0, s1;

    var key    = peg$currPos * 100 + 4,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = [];
    s1 = peg$parsewhitespace();
    if (s1 === peg$FAILED) {
      s1 = peg$parsecomment();
    }
    if (s1 !== peg$FAILED) {
      while (s1 !== peg$FAILED) {
        s0.push(s1);
        s1 = peg$parsewhitespace();
        if (s1 === peg$FAILED) {
          s1 = peg$parsecomment();
        }
      }
    } else {
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsenoise() {
    var s0;

    var key    = peg$currPos * 100 + 5,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$parse_();
    if (s0 === peg$FAILED) {
      if (peg$c11.test(input.charAt(peg$currPos))) {
        s0 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c12); }
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseEOL() {
    var s0, s1, s2, s3;

    var key    = peg$currPos * 100 + 6,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parsenoise();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parsenoise();
    }
    if (s1 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 13) {
        s2 = peg$c13;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c14); }
      }
      if (s2 === peg$FAILED) {
        s2 = null;
      }
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 10) {
          s3 = peg$c15;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c16); }
        }
        if (s3 !== peg$FAILED) {
          s1 = [s1, s2, s3];
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseEOF() {
    var s0, s1;

    var key    = peg$currPos * 100 + 7,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    peg$silentFails++;
    if (input.length > peg$currPos) {
      s1 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c17); }
    }
    peg$silentFails--;
    if (s1 === peg$FAILED) {
      s0 = void 0;
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseignore_rest_of_line() {
    var s0, s1, s2, s3;

    var key    = peg$currPos * 100 + 8,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parse_();
    if (s1 !== peg$FAILED) {
      s2 = [];
      if (peg$c18.test(input.charAt(peg$currPos))) {
        s3 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c19); }
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        if (peg$c18.test(input.charAt(peg$currPos))) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c19); }
        }
      }
      if (s2 !== peg$FAILED) {
        s1 = [s1, s2];
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = null;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsestatement() {
    var s0, s1, s2;

    var key    = peg$currPos * 100 + 9,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parse_();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parse_();
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parsebreak();
      if (s2 === peg$FAILED) {
        s2 = peg$parsecontinue();
        if (s2 === peg$FAILED) {
          s2 = peg$parsefunction();
          if (s2 === peg$FAILED) {
            s2 = peg$parsefunction_call();
            if (s2 === peg$FAILED) {
              s2 = peg$parsefunction_return();
              if (s2 === peg$FAILED) {
                s2 = peg$parseloop();
                if (s2 === peg$FAILED) {
                  s2 = peg$parseconditional();
                  if (s2 === peg$FAILED) {
                    s2 = peg$parseoperation();
                    if (s2 === peg$FAILED) {
                      s2 = peg$parsenor();
                    }
                  }
                }
              }
            }
          }
        }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c1(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsebreak() {
    var s0, s1, s2;

    var key    = peg$currPos * 100 + 10,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c20) {
      s1 = input.substr(peg$currPos, 5);
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c21); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseignore_rest_of_line();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c22();
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsecontinue() {
    var s0, s1, s2, s3;

    var key    = peg$currPos * 100 + 11,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$currPos;
    if (input.substr(peg$currPos, 8).toLowerCase() === peg$c23) {
      s2 = input.substr(peg$currPos, 8);
      peg$currPos += 8;
    } else {
      s2 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c24); }
    }
    if (s2 !== peg$FAILED) {
      s3 = peg$parseignore_rest_of_line();
      if (s3 !== peg$FAILED) {
        s2 = [s2, s3];
        s1 = s2;
      } else {
        peg$currPos = s1;
        s1 = peg$FAILED;
      }
    } else {
      peg$currPos = s1;
      s1 = peg$FAILED;
    }
    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 18).toLowerCase() === peg$c25) {
        s1 = input.substr(peg$currPos, 18);
        peg$currPos += 18;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c26); }
      }
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c27();
    }
    s0 = s1;

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsetakes() {
    var s0;

    var key    = peg$currPos * 100 + 12,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c28) {
      s0 = input.substr(peg$currPos, 5);
      peg$currPos += 5;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c29); }
    }
    if (s0 === peg$FAILED) {
      if (input.substr(peg$currPos, 5).toLowerCase() === peg$c30) {
        s0 = input.substr(peg$currPos, 5);
        peg$currPos += 5;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c31); }
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsefunction() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8;

    var key    = peg$currPos * 100 + 13,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parsevariable();
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        s3 = peg$parsetakes();
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            s5 = peg$parsevariable_list();
            if (s5 !== peg$FAILED) {
              s6 = peg$parseEOL();
              if (s6 !== peg$FAILED) {
                s7 = peg$parseblock();
                if (s7 !== peg$FAILED) {
                  s8 = peg$parseEOL();
                  if (s8 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$c32(s1, s5, s7);
                    s0 = s1;
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseexpression_list_separator() {
    var s0, s1, s2, s3;

    var key    = peg$currPos * 100 + 14,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parse_();
    if (s1 === peg$FAILED) {
      s1 = null;
    }
    if (s1 !== peg$FAILED) {
      if (input.substr(peg$currPos, 5) === peg$c33) {
        s2 = peg$c33;
        peg$currPos += 5;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c34); }
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parse_();
        if (s3 !== peg$FAILED) {
          s1 = [s1, s2, s3];
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parse_();
      if (s1 === peg$FAILED) {
        s1 = null;
      }
      if (s1 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 38) {
          s2 = peg$c35;
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c36); }
        }
        if (s2 === peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 44) {
            s2 = peg$c37;
            peg$currPos++;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c38); }
          }
          if (s2 === peg$FAILED) {
            if (input.substr(peg$currPos, 3) === peg$c39) {
              s2 = peg$c39;
              peg$currPos += 3;
            } else {
              s2 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c40); }
            }
          }
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parse_();
          if (s3 === peg$FAILED) {
            s3 = null;
          }
          if (s3 !== peg$FAILED) {
            s1 = [s1, s2, s3];
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsevariable_list_separator() {
    var s0, s1, s2, s3;

    var key    = peg$currPos * 100 + 15,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$parseexpression_list_separator();
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parse_();
      if (s1 !== peg$FAILED) {
        if (input.substr(peg$currPos, 3) === peg$c41) {
          s2 = peg$c41;
          peg$currPos += 3;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c42); }
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parse_();
          if (s3 !== peg$FAILED) {
            s1 = [s1, s2, s3];
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsevariable_list() {
    var s0, s1, s2, s3;

    var key    = peg$currPos * 100 + 16,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parsevariable();
    if (s1 !== peg$FAILED) {
      s2 = peg$parsevariable_list_separator();
      if (s2 !== peg$FAILED) {
        s3 = peg$parsevariable_list();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c43(s1, s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parsevariable();
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c44(s1);
      }
      s0 = s1;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsefunction_call() {
    var s0, s1, s2, s3, s4, s5;

    var key    = peg$currPos * 100 + 17,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parsevariable();
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 6).toLowerCase() === peg$c45) {
          s3 = input.substr(peg$currPos, 6);
          peg$currPos += 6;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c46); }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            s5 = peg$parseexpression_list();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c47(s1, s5);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseexpression_list() {
    var s0, s1, s2, s3;

    var key    = peg$currPos * 100 + 18,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parsesimple_expression();
    if (s1 !== peg$FAILED) {
      s2 = peg$parseexpression_list_separator();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseexpression_list();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c43(s1, s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parsesimple_expression();
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c44(s1);
      }
      s0 = s1;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsereturn() {
    var s0;

    var key    = peg$currPos * 100 + 19,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    if (input.substr(peg$currPos, 6).toLowerCase() === peg$c48) {
      s0 = input.substr(peg$currPos, 6);
      peg$currPos += 6;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c49); }
    }
    if (s0 === peg$FAILED) {
      if (input.substr(peg$currPos, 9).toLowerCase() === peg$c50) {
        s0 = input.substr(peg$currPos, 9);
        peg$currPos += 9;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c51); }
      }
      if (s0 === peg$FAILED) {
        if (input.substr(peg$currPos, 4).toLowerCase() === peg$c52) {
          s0 = input.substr(peg$currPos, 4);
          peg$currPos += 4;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c53); }
        }
        if (s0 === peg$FAILED) {
          if (input.substr(peg$currPos, 4).toLowerCase() === peg$c54) {
            s0 = input.substr(peg$currPos, 4);
            peg$currPos += 4;
          } else {
            s0 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c55); }
          }
        }
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsefunction_return() {
    var s0, s1, s2, s3, s4, s5, s6;

    var key    = peg$currPos * 100 + 20,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parsereturn();
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        s3 = peg$parsenor();
        if (s3 !== peg$FAILED) {
          s4 = peg$currPos;
          s5 = peg$parse_();
          if (s5 !== peg$FAILED) {
            if (input.substr(peg$currPos, 4).toLowerCase() === peg$c56) {
              s6 = input.substr(peg$currPos, 4);
              peg$currPos += 4;
            } else {
              s6 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c57); }
            }
            if (s6 !== peg$FAILED) {
              s5 = [s5, s6];
              s4 = s5;
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
          } else {
            peg$currPos = s4;
            s4 = peg$FAILED;
          }
          if (s4 === peg$FAILED) {
            s4 = null;
          }
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c58(s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseoperation() {
    var s0;

    var key    = peg$currPos * 100 + 21,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$parsereadline();
    if (s0 === peg$FAILED) {
      s0 = peg$parseoutput();
      if (s0 === peg$FAILED) {
        s0 = peg$parsecrement();
        if (s0 === peg$FAILED) {
          s0 = peg$parsemutation();
          if (s0 === peg$FAILED) {
            s0 = peg$parseassignment();
            if (s0 === peg$FAILED) {
              s0 = peg$parserounding();
            }
          }
        }
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsereadline() {
    var s0, s1, s2, s3;

    var key    = peg$currPos * 100 + 22,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 9).toLowerCase() === peg$c59) {
      s1 = input.substr(peg$currPos, 9);
      peg$currPos += 9;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c60); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseassignable();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c61(s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 6).toLowerCase() === peg$c62) {
        s1 = input.substr(peg$currPos, 6);
        peg$currPos += 6;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c63); }
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c64();
      }
      s0 = s1;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsecontinuation() {
    var s0, s1, s2, s3;

    var key    = peg$currPos * 100 + 23,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parseEOL();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parse_();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parse_();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parsestatement();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c1(s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseblock() {
    var s0, s1, s2, s3;

    var key    = peg$currPos * 100 + 24,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parsestatement();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parsecontinuation();
      if (s3 !== peg$FAILED) {
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$parsecontinuation();
        }
      } else {
        s2 = peg$FAILED;
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c65(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parsestatement();
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c1(s1);
      }
      s0 = s1;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseconsequent() {
    var s0, s1, s2;

    var key    = peg$currPos * 100 + 25,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parse_();
    if (s1 !== peg$FAILED) {
      s2 = peg$parsestatement();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c1(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parseEOL();
      if (s1 !== peg$FAILED) {
        s2 = peg$parseblock();
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c1(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsealternate() {
    var s0, s1, s2, s3, s4;

    var key    = peg$currPos * 100 + 26,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parse_();
    if (s1 !== peg$FAILED) {
      if (input.substr(peg$currPos, 4).toLowerCase() === peg$c66) {
        s2 = input.substr(peg$currPos, 4);
        peg$currPos += 4;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c67); }
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parse_();
        if (s3 !== peg$FAILED) {
          s4 = peg$parsestatement();
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c68(s4);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = [];
      s2 = peg$parseEOL();
      if (s2 !== peg$FAILED) {
        while (s2 !== peg$FAILED) {
          s1.push(s2);
          s2 = peg$parseEOL();
        }
      } else {
        s1 = peg$FAILED;
      }
      if (s1 !== peg$FAILED) {
        if (input.substr(peg$currPos, 4).toLowerCase() === peg$c66) {
          s2 = input.substr(peg$currPos, 4);
          peg$currPos += 4;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c67); }
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parse_();
          if (s3 !== peg$FAILED) {
            s4 = peg$parsestatement();
            if (s4 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c68(s4);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        s1 = [];
        s2 = peg$parseEOL();
        if (s2 !== peg$FAILED) {
          while (s2 !== peg$FAILED) {
            s1.push(s2);
            s2 = peg$parseEOL();
          }
        } else {
          s1 = peg$FAILED;
        }
        if (s1 !== peg$FAILED) {
          if (input.substr(peg$currPos, 4).toLowerCase() === peg$c66) {
            s2 = input.substr(peg$currPos, 4);
            peg$currPos += 4;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c67); }
          }
          if (s2 !== peg$FAILED) {
            s3 = peg$parseEOL();
            if (s3 !== peg$FAILED) {
              s4 = peg$parseblock();
              if (s4 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c68(s4);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          s1 = peg$parseEOL();
          if (s1 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c2();
          }
          s0 = s1;
        }
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseconditional() {
    var s0, s1, s2, s3, s4, s5;

    var key    = peg$currPos * 100 + 27,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 2).toLowerCase() === peg$c69) {
      s1 = input.substr(peg$currPos, 2);
      peg$currPos += 2;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c70); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        s3 = peg$parsenor();
        if (s3 !== peg$FAILED) {
          s4 = peg$parseconsequent();
          if (s4 === peg$FAILED) {
            s4 = null;
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parsealternate();
            if (s5 === peg$FAILED) {
              s5 = null;
            }
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c71(s3, s4, s5);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseloopable() {
    var s0, s1, s2, s3;

    var key    = peg$currPos * 100 + 28,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parse_();
    if (s1 !== peg$FAILED) {
      s2 = peg$parsestatement();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c1(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parseEOL();
      if (s1 !== peg$FAILED) {
        s2 = peg$parseblock();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseEOL();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c1(s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseloop() {
    var s0, s1, s2, s3, s4;

    var key    = peg$currPos * 100 + 29,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c72) {
      s1 = input.substr(peg$currPos, 5);
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c73); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        s3 = peg$parsenor();
        if (s3 !== peg$FAILED) {
          s4 = peg$parseloopable();
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c74(s3, s4);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 5).toLowerCase() === peg$c75) {
        s1 = input.substr(peg$currPos, 5);
        peg$currPos += 5;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c76); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          s3 = peg$parsenor();
          if (s3 !== peg$FAILED) {
            s4 = peg$parseloopable();
            if (s4 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c77(s3, s4);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseoutput() {
    var s0, s1, s2, s3;

    var key    = peg$currPos * 100 + 30,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 3).toLowerCase() === peg$c78) {
      s1 = input.substr(peg$currPos, 3);
      peg$currPos += 3;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c79); }
    }
    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 5).toLowerCase() === peg$c80) {
        s1 = input.substr(peg$currPos, 5);
        peg$currPos += 5;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c81); }
      }
      if (s1 === peg$FAILED) {
        if (input.substr(peg$currPos, 7).toLowerCase() === peg$c82) {
          s1 = input.substr(peg$currPos, 7);
          peg$currPos += 7;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c83); }
        }
        if (s1 === peg$FAILED) {
          if (input.substr(peg$currPos, 6).toLowerCase() === peg$c84) {
            s1 = input.substr(peg$currPos, 6);
            peg$currPos += 6;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c85); }
          }
        }
      }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        s3 = peg$parsenor();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c86(s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsesimple_expression() {
    var s0;

    var key    = peg$currPos * 100 + 31,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$parsefunction_call();
    if (s0 === peg$FAILED) {
      s0 = peg$parseconstant();
      if (s0 === peg$FAILED) {
        s0 = peg$parselookup();
        if (s0 === peg$FAILED) {
          s0 = peg$parseliteral();
          if (s0 === peg$FAILED) {
            s0 = peg$parsepronoun();
          }
        }
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseliteral() {
    var s0;

    var key    = peg$currPos * 100 + 32,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$parseconstant();
    if (s0 === peg$FAILED) {
      s0 = peg$parsenumber();
      if (s0 === peg$FAILED) {
        s0 = peg$parsestring();
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseconstant() {
    var s0;

    var key    = peg$currPos * 100 + 33,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$parsenull();
    if (s0 === peg$FAILED) {
      s0 = peg$parsetrue();
      if (s0 === peg$FAILED) {
        s0 = peg$parsefalse();
        if (s0 === peg$FAILED) {
          s0 = peg$parseempty_string();
          if (s0 === peg$FAILED) {
            s0 = peg$parsemysterious();
          }
        }
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsetrue() {
    var s0, s1, s2, s3;

    var key    = peg$currPos * 100 + 34,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 4).toLowerCase() === peg$c87) {
      s1 = input.substr(peg$currPos, 4);
      peg$currPos += 4;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c88); }
    }
    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 2).toLowerCase() === peg$c89) {
        s1 = input.substr(peg$currPos, 2);
        peg$currPos += 2;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c90); }
      }
      if (s1 === peg$FAILED) {
        if (input.substr(peg$currPos, 5).toLowerCase() === peg$c91) {
          s1 = input.substr(peg$currPos, 5);
          peg$currPos += 5;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c92); }
        }
        if (s1 === peg$FAILED) {
          if (input.substr(peg$currPos, 3).toLowerCase() === peg$c93) {
            s1 = input.substr(peg$currPos, 3);
            peg$currPos += 3;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c94); }
          }
        }
      }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$currPos;
      peg$silentFails++;
      s3 = peg$parseletter();
      peg$silentFails--;
      if (s3 === peg$FAILED) {
        s2 = void 0;
      } else {
        peg$currPos = s2;
        s2 = peg$FAILED;
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c95();
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsefalse() {
    var s0, s1, s2, s3;

    var key    = peg$currPos * 100 + 35,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c96) {
      s1 = input.substr(peg$currPos, 5);
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c97); }
    }
    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 4).toLowerCase() === peg$c98) {
        s1 = input.substr(peg$currPos, 4);
        peg$currPos += 4;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c99); }
      }
      if (s1 === peg$FAILED) {
        if (input.substr(peg$currPos, 5).toLowerCase() === peg$c100) {
          s1 = input.substr(peg$currPos, 5);
          peg$currPos += 5;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c101); }
        }
        if (s1 === peg$FAILED) {
          if (input.substr(peg$currPos, 2).toLowerCase() === peg$c102) {
            s1 = input.substr(peg$currPos, 2);
            peg$currPos += 2;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c103); }
          }
        }
      }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$currPos;
      peg$silentFails++;
      s3 = peg$parseletter();
      peg$silentFails--;
      if (s3 === peg$FAILED) {
        s2 = void 0;
      } else {
        peg$currPos = s2;
        s2 = peg$FAILED;
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c104();
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsenull() {
    var s0, s1;

    var key    = peg$currPos * 100 + 36,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 4).toLowerCase() === peg$c105) {
      s1 = input.substr(peg$currPos, 4);
      peg$currPos += 4;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c106); }
    }
    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 7).toLowerCase() === peg$c107) {
        s1 = input.substr(peg$currPos, 7);
        peg$currPos += 7;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c108); }
      }
      if (s1 === peg$FAILED) {
        if (input.substr(peg$currPos, 7).toLowerCase() === peg$c109) {
          s1 = input.substr(peg$currPos, 7);
          peg$currPos += 7;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c110); }
        }
        if (s1 === peg$FAILED) {
          if (input.substr(peg$currPos, 6).toLowerCase() === peg$c111) {
            s1 = input.substr(peg$currPos, 6);
            peg$currPos += 6;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c112); }
          }
          if (s1 === peg$FAILED) {
            if (input.substr(peg$currPos, 4).toLowerCase() === peg$c113) {
              s1 = input.substr(peg$currPos, 4);
              peg$currPos += 4;
            } else {
              s1 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c114); }
            }
          }
        }
      }
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c115();
    }
    s0 = s1;

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseempty_string() {
    var s0, s1;

    var key    = peg$currPos * 100 + 37,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c116) {
      s1 = input.substr(peg$currPos, 5);
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c117); }
    }
    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 6).toLowerCase() === peg$c118) {
        s1 = input.substr(peg$currPos, 6);
        peg$currPos += 6;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c119); }
      }
      if (s1 === peg$FAILED) {
        if (input.substr(peg$currPos, 7).toLowerCase() === peg$c120) {
          s1 = input.substr(peg$currPos, 7);
          peg$currPos += 7;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c121); }
        }
      }
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c122();
    }
    s0 = s1;

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsemysterious() {
    var s0, s1;

    var key    = peg$currPos * 100 + 38,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 10) === peg$c123) {
      s1 = peg$c123;
      peg$currPos += 10;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c124); }
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c125();
    }
    s0 = s1;

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsenumber() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8;

    var key    = peg$currPos * 100 + 39,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$currPos;
    s2 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 45) {
      s3 = peg$c126;
      peg$currPos++;
    } else {
      s3 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c127); }
    }
    if (s3 === peg$FAILED) {
      s3 = null;
    }
    if (s3 !== peg$FAILED) {
      s4 = [];
      if (peg$c128.test(input.charAt(peg$currPos))) {
        s5 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s5 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c129); }
      }
      if (s5 !== peg$FAILED) {
        while (s5 !== peg$FAILED) {
          s4.push(s5);
          if (peg$c128.test(input.charAt(peg$currPos))) {
            s5 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c129); }
          }
        }
      } else {
        s4 = peg$FAILED;
      }
      if (s4 !== peg$FAILED) {
        s5 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 46) {
          s6 = peg$c130;
          peg$currPos++;
        } else {
          s6 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c131); }
        }
        if (s6 !== peg$FAILED) {
          s7 = [];
          if (peg$c128.test(input.charAt(peg$currPos))) {
            s8 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s8 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c129); }
          }
          if (s8 !== peg$FAILED) {
            while (s8 !== peg$FAILED) {
              s7.push(s8);
              if (peg$c128.test(input.charAt(peg$currPos))) {
                s8 = input.charAt(peg$currPos);
                peg$currPos++;
              } else {
                s8 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c129); }
              }
            }
          } else {
            s7 = peg$FAILED;
          }
          if (s7 !== peg$FAILED) {
            s6 = [s6, s7];
            s5 = s6;
          } else {
            peg$currPos = s5;
            s5 = peg$FAILED;
          }
        } else {
          peg$currPos = s5;
          s5 = peg$FAILED;
        }
        if (s5 === peg$FAILED) {
          s5 = null;
        }
        if (s5 !== peg$FAILED) {
          s3 = [s3, s4, s5];
          s2 = s3;
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
      } else {
        peg$currPos = s2;
        s2 = peg$FAILED;
      }
    } else {
      peg$currPos = s2;
      s2 = peg$FAILED;
    }
    if (s2 !== peg$FAILED) {
      s1 = input.substring(s1, peg$currPos);
    } else {
      s1 = s2;
    }
    if (s1 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 46) {
        s2 = peg$c130;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c131); }
      }
      if (s2 === peg$FAILED) {
        s2 = null;
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c132(s1);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$currPos;
      s2 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 46) {
        s3 = peg$c130;
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c131); }
      }
      if (s3 !== peg$FAILED) {
        s4 = [];
        if (peg$c128.test(input.charAt(peg$currPos))) {
          s5 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c129); }
        }
        if (s5 !== peg$FAILED) {
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            if (peg$c128.test(input.charAt(peg$currPos))) {
              s5 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c129); }
            }
          }
        } else {
          s4 = peg$FAILED;
        }
        if (s4 !== peg$FAILED) {
          s3 = [s3, s4];
          s2 = s3;
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
      } else {
        peg$currPos = s2;
        s2 = peg$FAILED;
      }
      if (s2 !== peg$FAILED) {
        s1 = input.substring(s1, peg$currPos);
      } else {
        s1 = s2;
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c133(s1);
      }
      s0 = s1;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsestring() {
    var s0, s1, s2, s3, s4;

    var key    = peg$currPos * 100 + 40,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 34) {
      s1 = peg$c134;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c135); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$currPos;
      s3 = [];
      if (peg$c136.test(input.charAt(peg$currPos))) {
        s4 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s4 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c137); }
      }
      while (s4 !== peg$FAILED) {
        s3.push(s4);
        if (peg$c136.test(input.charAt(peg$currPos))) {
          s4 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s4 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c137); }
        }
      }
      if (s3 !== peg$FAILED) {
        s2 = input.substring(s2, peg$currPos);
      } else {
        s2 = s3;
      }
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 34) {
          s3 = peg$c134;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c135); }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c138(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsenor() {
    var s0, s1, s2, s3, s4, s5;

    var key    = peg$currPos * 100 + 41,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parseor();
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 3) === peg$c139) {
          s3 = peg$c139;
          peg$currPos += 3;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c140); }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            s5 = peg$parsenor();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c141(s1, s5);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$parseor();
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseor() {
    var s0, s1, s2, s3, s4, s5;

    var key    = peg$currPos * 100 + 42,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parseand();
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 2) === peg$c142) {
          s3 = peg$c142;
          peg$currPos += 2;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c143); }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            s5 = peg$parseor();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c144(s1, s5);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$parseand();
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseand() {
    var s0, s1, s2, s3, s4, s5;

    var key    = peg$currPos * 100 + 43,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parseequality_check();
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 3) === peg$c41) {
          s3 = peg$c41;
          peg$currPos += 3;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c42); }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            s5 = peg$parseand();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c145(s1, s5);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$parseequality_check();
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseeq() {
    var s0, s1;

    var key    = peg$currPos * 100 + 44,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 4).toLowerCase() === peg$c146) {
      s1 = input.substr(peg$currPos, 4);
      peg$currPos += 4;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c147); }
    }
    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 5).toLowerCase() === peg$c148) {
        s1 = input.substr(peg$currPos, 5);
        peg$currPos += 5;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c149); }
      }
      if (s1 === peg$FAILED) {
        if (input.substr(peg$currPos, 4).toLowerCase() === peg$c150) {
          s1 = input.substr(peg$currPos, 4);
          peg$currPos += 4;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c151); }
        }
        if (s1 === peg$FAILED) {
          if (input.substr(peg$currPos, 5).toLowerCase() === peg$c152) {
            s1 = input.substr(peg$currPos, 5);
            peg$currPos += 5;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c153); }
          }
        }
      }
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c154();
    }
    s0 = s1;
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 2).toLowerCase() === peg$c155) {
        s1 = input.substr(peg$currPos, 2);
        peg$currPos += 2;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c156); }
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c157();
      }
      s0 = s1;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseequality_check() {
    var s0, s1, s2, s3, s4, s5;

    var key    = peg$currPos * 100 + 45,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parsenot();
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseeq();
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            s5 = peg$parseequality_check();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c158(s1, s3, s5);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$parsenot();
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsenot() {
    var s0, s1, s2, s3;

    var key    = peg$currPos * 100 + 46,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 3) === peg$c159) {
      s1 = peg$c159;
      peg$currPos += 3;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c160); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        s3 = peg$parsenot();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c161(s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$parsecomparison();
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsecomparison() {
    var s0, s1, s2, s3, s4, s5;

    var key    = peg$currPos * 100 + 47,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parsearithmetic();
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        s3 = peg$parsecomparator();
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            s5 = peg$parsecomparison();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c158(s1, s3, s5);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$parsearithmetic();
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsegreater() {
    var s0;

    var key    = peg$currPos * 100 + 48,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    if (input.substr(peg$currPos, 6).toLowerCase() === peg$c162) {
      s0 = input.substr(peg$currPos, 6);
      peg$currPos += 6;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c163); }
    }
    if (s0 === peg$FAILED) {
      if (input.substr(peg$currPos, 7).toLowerCase() === peg$c164) {
        s0 = input.substr(peg$currPos, 7);
        peg$currPos += 7;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c165); }
      }
      if (s0 === peg$FAILED) {
        if (input.substr(peg$currPos, 6).toLowerCase() === peg$c166) {
          s0 = input.substr(peg$currPos, 6);
          peg$currPos += 6;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c167); }
        }
        if (s0 === peg$FAILED) {
          if (input.substr(peg$currPos, 8).toLowerCase() === peg$c168) {
            s0 = input.substr(peg$currPos, 8);
            peg$currPos += 8;
          } else {
            s0 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c169); }
          }
        }
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsesmaller() {
    var s0;

    var key    = peg$currPos * 100 + 49,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c170) {
      s0 = input.substr(peg$currPos, 5);
      peg$currPos += 5;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c171); }
    }
    if (s0 === peg$FAILED) {
      if (input.substr(peg$currPos, 4).toLowerCase() === peg$c172) {
        s0 = input.substr(peg$currPos, 4);
        peg$currPos += 4;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c173); }
      }
      if (s0 === peg$FAILED) {
        if (input.substr(peg$currPos, 7).toLowerCase() === peg$c174) {
          s0 = input.substr(peg$currPos, 7);
          peg$currPos += 7;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c175); }
        }
        if (s0 === peg$FAILED) {
          if (input.substr(peg$currPos, 6).toLowerCase() === peg$c176) {
            s0 = input.substr(peg$currPos, 6);
            peg$currPos += 6;
          } else {
            s0 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c177); }
          }
        }
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsegreat() {
    var s0;

    var key    = peg$currPos * 100 + 50,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    if (input.substr(peg$currPos, 4).toLowerCase() === peg$c178) {
      s0 = input.substr(peg$currPos, 4);
      peg$currPos += 4;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c179); }
    }
    if (s0 === peg$FAILED) {
      if (input.substr(peg$currPos, 5).toLowerCase() === peg$c180) {
        s0 = input.substr(peg$currPos, 5);
        peg$currPos += 5;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c181); }
      }
      if (s0 === peg$FAILED) {
        if (input.substr(peg$currPos, 3).toLowerCase() === peg$c182) {
          s0 = input.substr(peg$currPos, 3);
          peg$currPos += 3;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c183); }
        }
        if (s0 === peg$FAILED) {
          if (input.substr(peg$currPos, 6).toLowerCase() === peg$c184) {
            s0 = input.substr(peg$currPos, 6);
            peg$currPos += 6;
          } else {
            s0 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c185); }
          }
        }
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsesmall() {
    var s0;

    var key    = peg$currPos * 100 + 51,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    if (input.substr(peg$currPos, 3).toLowerCase() === peg$c186) {
      s0 = input.substr(peg$currPos, 3);
      peg$currPos += 3;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c187); }
    }
    if (s0 === peg$FAILED) {
      if (input.substr(peg$currPos, 6).toLowerCase() === peg$c188) {
        s0 = input.substr(peg$currPos, 6);
        peg$currPos += 6;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c189); }
      }
      if (s0 === peg$FAILED) {
        if (input.substr(peg$currPos, 5).toLowerCase() === peg$c190) {
          s0 = input.substr(peg$currPos, 5);
          peg$currPos += 5;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c191); }
        }
        if (s0 === peg$FAILED) {
          if (input.substr(peg$currPos, 4).toLowerCase() === peg$c192) {
            s0 = input.substr(peg$currPos, 4);
            peg$currPos += 4;
          } else {
            s0 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c193); }
          }
        }
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsecomparator() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    var key    = peg$currPos * 100 + 52,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 2).toLowerCase() === peg$c155) {
      s1 = input.substr(peg$currPos, 2);
      peg$currPos += 2;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c156); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        s3 = peg$parsegreater();
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            if (input.substr(peg$currPos, 4).toLowerCase() === peg$c194) {
              s5 = input.substr(peg$currPos, 4);
              peg$currPos += 4;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c195); }
            }
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c196();
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 2).toLowerCase() === peg$c155) {
        s1 = input.substr(peg$currPos, 2);
        peg$currPos += 2;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c156); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          s3 = peg$parsesmaller();
          if (s3 !== peg$FAILED) {
            s4 = peg$parse_();
            if (s4 !== peg$FAILED) {
              if (input.substr(peg$currPos, 4).toLowerCase() === peg$c194) {
                s5 = input.substr(peg$currPos, 4);
                peg$currPos += 4;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c195); }
              }
              if (s5 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c197();
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 2).toLowerCase() === peg$c155) {
          s1 = input.substr(peg$currPos, 2);
          peg$currPos += 2;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c156); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parse_();
          if (s2 !== peg$FAILED) {
            if (input.substr(peg$currPos, 2).toLowerCase() === peg$c198) {
              s3 = input.substr(peg$currPos, 2);
              peg$currPos += 2;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c199); }
            }
            if (s3 !== peg$FAILED) {
              s4 = peg$parse_();
              if (s4 !== peg$FAILED) {
                s5 = peg$parsegreat();
                if (s5 !== peg$FAILED) {
                  s6 = peg$parse_();
                  if (s6 !== peg$FAILED) {
                    if (input.substr(peg$currPos, 2).toLowerCase() === peg$c198) {
                      s7 = input.substr(peg$currPos, 2);
                      peg$currPos += 2;
                    } else {
                      s7 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c199); }
                    }
                    if (s7 !== peg$FAILED) {
                      peg$savedPos = s0;
                      s1 = peg$c200();
                      s0 = s1;
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.substr(peg$currPos, 2).toLowerCase() === peg$c155) {
            s1 = input.substr(peg$currPos, 2);
            peg$currPos += 2;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c156); }
          }
          if (s1 !== peg$FAILED) {
            s2 = peg$parse_();
            if (s2 !== peg$FAILED) {
              if (input.substr(peg$currPos, 2).toLowerCase() === peg$c198) {
                s3 = input.substr(peg$currPos, 2);
                peg$currPos += 2;
              } else {
                s3 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c199); }
              }
              if (s3 !== peg$FAILED) {
                s4 = peg$parse_();
                if (s4 !== peg$FAILED) {
                  s5 = peg$parsesmall();
                  if (s5 !== peg$FAILED) {
                    s6 = peg$parse_();
                    if (s6 !== peg$FAILED) {
                      if (input.substr(peg$currPos, 2).toLowerCase() === peg$c198) {
                        s7 = input.substr(peg$currPos, 2);
                        peg$currPos += 2;
                      } else {
                        s7 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c199); }
                      }
                      if (s7 !== peg$FAILED) {
                        peg$savedPos = s0;
                        s1 = peg$c201();
                        s0 = s1;
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        }
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsearithmetic() {
    var s0, s1, s2, s3, s4, s5;

    var key    = peg$currPos * 100 + 53,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parseproduct();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$currPos;
      s4 = peg$parseadd();
      if (s4 === peg$FAILED) {
        s4 = peg$parsesubtract();
      }
      if (s4 !== peg$FAILED) {
        s5 = peg$parseproduct();
        if (s5 !== peg$FAILED) {
          s4 = [s4, s5];
          s3 = s4;
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      } else {
        peg$currPos = s3;
        s3 = peg$FAILED;
      }
      if (s3 !== peg$FAILED) {
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$currPos;
          s4 = peg$parseadd();
          if (s4 === peg$FAILED) {
            s4 = peg$parsesubtract();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseproduct();
            if (s5 !== peg$FAILED) {
              s4 = [s4, s5];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        }
      } else {
        s2 = peg$FAILED;
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c202(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$parseproduct();
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseproduct() {
    var s0, s1, s2, s3, s4, s5;

    var key    = peg$currPos * 100 + 54,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parsesimple_expression();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$currPos;
      s4 = peg$parsemultiply();
      if (s4 === peg$FAILED) {
        s4 = peg$parsedivide();
      }
      if (s4 !== peg$FAILED) {
        s5 = peg$parseexpression_list();
        if (s5 !== peg$FAILED) {
          s4 = [s4, s5];
          s3 = s4;
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      } else {
        peg$currPos = s3;
        s3 = peg$FAILED;
      }
      if (s3 !== peg$FAILED) {
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$currPos;
          s4 = peg$parsemultiply();
          if (s4 === peg$FAILED) {
            s4 = peg$parsedivide();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseexpression_list();
            if (s5 !== peg$FAILED) {
              s4 = [s4, s5];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        }
      } else {
        s2 = peg$FAILED;
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c203(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$parseexpression_list();
      if (s0 === peg$FAILED) {
        s0 = peg$parsesimple_expression();
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseadd() {
    var s0, s1, s2, s3, s4;

    var key    = peg$currPos * 100 + 55,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parse_();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parse_();
    }
    if (s1 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 43) {
        s2 = peg$c204;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c205); }
      }
      if (s2 === peg$FAILED) {
        if (input.substr(peg$currPos, 5) === peg$c206) {
          s2 = peg$c206;
          peg$currPos += 5;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c207); }
        }
        if (s2 === peg$FAILED) {
          if (input.substr(peg$currPos, 5) === peg$c208) {
            s2 = peg$c208;
            peg$currPos += 5;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c209); }
          }
        }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parse_();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parse_();
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c210();
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsesubtract() {
    var s0, s1, s2, s3, s4;

    var key    = peg$currPos * 100 + 56,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parse_();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parse_();
    }
    if (s1 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 45) {
        s2 = peg$c126;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c127); }
      }
      if (s2 === peg$FAILED) {
        if (input.substr(peg$currPos, 6) === peg$c211) {
          s2 = peg$c211;
          peg$currPos += 6;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c212); }
        }
        if (s2 === peg$FAILED) {
          if (input.substr(peg$currPos, 8) === peg$c213) {
            s2 = peg$c213;
            peg$currPos += 8;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c214); }
          }
        }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parse_();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parse_();
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c215();
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsemultiply() {
    var s0, s1, s2, s3, s4;

    var key    = peg$currPos * 100 + 57,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parse_();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parse_();
    }
    if (s1 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 42) {
        s2 = peg$c216;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c217); }
      }
      if (s2 === peg$FAILED) {
        if (input.substr(peg$currPos, 6) === peg$c218) {
          s2 = peg$c218;
          peg$currPos += 6;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c219); }
        }
        if (s2 === peg$FAILED) {
          if (input.substr(peg$currPos, 3) === peg$c220) {
            s2 = peg$c220;
            peg$currPos += 3;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c221); }
          }
        }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parse_();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parse_();
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c222();
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsedivide() {
    var s0, s1, s2, s3, s4;

    var key    = peg$currPos * 100 + 58,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parse_();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parse_();
    }
    if (s1 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 47) {
        s2 = peg$c223;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c224); }
      }
      if (s2 === peg$FAILED) {
        if (input.substr(peg$currPos, 5) === peg$c225) {
          s2 = peg$c225;
          peg$currPos += 5;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c226); }
        }
        if (s2 === peg$FAILED) {
          if (input.substr(peg$currPos, 8) === peg$c227) {
            s2 = peg$c227;
            peg$currPos += 8;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c228); }
          }
        }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parse_();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parse_();
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c229();
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsecompoundable_operator() {
    var s0;

    var key    = peg$currPos * 100 + 59,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$parseadd();
    if (s0 === peg$FAILED) {
      s0 = peg$parsesubtract();
      if (s0 === peg$FAILED) {
        s0 = peg$parsemultiply();
        if (s0 === peg$FAILED) {
          s0 = peg$parsedivide();
        }
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsepronoun() {
    var s0, s1, s2, s3;

    var key    = peg$currPos * 100 + 60,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 4).toLowerCase() === peg$c230) {
      s1 = input.substr(peg$currPos, 4);
      peg$currPos += 4;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c231); }
    }
    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 4).toLowerCase() === peg$c232) {
        s1 = input.substr(peg$currPos, 4);
        peg$currPos += 4;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c233); }
      }
      if (s1 === peg$FAILED) {
        if (input.substr(peg$currPos, 3).toLowerCase() === peg$c234) {
          s1 = input.substr(peg$currPos, 3);
          peg$currPos += 3;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c235); }
        }
        if (s1 === peg$FAILED) {
          if (input.substr(peg$currPos, 3).toLowerCase() === peg$c236) {
            s1 = input.substr(peg$currPos, 3);
            peg$currPos += 3;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c237); }
          }
          if (s1 === peg$FAILED) {
            if (input.substr(peg$currPos, 3).toLowerCase() === peg$c238) {
              s1 = input.substr(peg$currPos, 3);
              peg$currPos += 3;
            } else {
              s1 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c239); }
            }
            if (s1 === peg$FAILED) {
              if (input.substr(peg$currPos, 3).toLowerCase() === peg$c240) {
                s1 = input.substr(peg$currPos, 3);
                peg$currPos += 3;
              } else {
                s1 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c241); }
              }
              if (s1 === peg$FAILED) {
                if (input.substr(peg$currPos, 3).toLowerCase() === peg$c242) {
                  s1 = input.substr(peg$currPos, 3);
                  peg$currPos += 3;
                } else {
                  s1 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c243); }
                }
                if (s1 === peg$FAILED) {
                  if (input.substr(peg$currPos, 3).toLowerCase() === peg$c244) {
                    s1 = input.substr(peg$currPos, 3);
                    peg$currPos += 3;
                  } else {
                    s1 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c245); }
                  }
                  if (s1 === peg$FAILED) {
                    if (input.substr(peg$currPos, 3).toLowerCase() === peg$c246) {
                      s1 = input.substr(peg$currPos, 3);
                      peg$currPos += 3;
                    } else {
                      s1 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c247); }
                    }
                    if (s1 === peg$FAILED) {
                      if (input.substr(peg$currPos, 3).toLowerCase() === peg$c248) {
                        s1 = input.substr(peg$currPos, 3);
                        peg$currPos += 3;
                      } else {
                        s1 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c249); }
                      }
                      if (s1 === peg$FAILED) {
                        if (input.substr(peg$currPos, 2).toLowerCase() === peg$c250) {
                          s1 = input.substr(peg$currPos, 2);
                          peg$currPos += 2;
                        } else {
                          s1 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c251); }
                        }
                        if (s1 === peg$FAILED) {
                          if (input.substr(peg$currPos, 2).toLowerCase() === peg$c252) {
                            s1 = input.substr(peg$currPos, 2);
                            peg$currPos += 2;
                          } else {
                            s1 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c253); }
                          }
                          if (s1 === peg$FAILED) {
                            if (input.substr(peg$currPos, 2).toLowerCase() === peg$c254) {
                              s1 = input.substr(peg$currPos, 2);
                              peg$currPos += 2;
                            } else {
                              s1 = peg$FAILED;
                              if (peg$silentFails === 0) { peg$fail(peg$c255); }
                            }
                            if (s1 === peg$FAILED) {
                              if (input.substr(peg$currPos, 2).toLowerCase() === peg$c256) {
                                s1 = input.substr(peg$currPos, 2);
                                peg$currPos += 2;
                              } else {
                                s1 = peg$FAILED;
                                if (peg$silentFails === 0) { peg$fail(peg$c257); }
                              }
                              if (s1 === peg$FAILED) {
                                if (input.substr(peg$currPos, 2).toLowerCase() === peg$c258) {
                                  s1 = input.substr(peg$currPos, 2);
                                  peg$currPos += 2;
                                } else {
                                  s1 = peg$FAILED;
                                  if (peg$silentFails === 0) { peg$fail(peg$c259); }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$currPos;
      peg$silentFails++;
      s3 = peg$parse_();
      if (s3 === peg$FAILED) {
        s3 = peg$parseEOL();
        if (s3 === peg$FAILED) {
          s3 = peg$parseEOF();
        }
      }
      peg$silentFails--;
      if (s3 !== peg$FAILED) {
        peg$currPos = s2;
        s2 = void 0;
      } else {
        s2 = peg$FAILED;
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c260(s1);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsecommon_prefix() {
    var s0;

    var key    = peg$currPos * 100 + 61,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    if (input.substr(peg$currPos, 2).toLowerCase() === peg$c261) {
      s0 = input.substr(peg$currPos, 2);
      peg$currPos += 2;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c262); }
    }
    if (s0 === peg$FAILED) {
      if (input.substr(peg$currPos, 1).toLowerCase() === peg$c263) {
        s0 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c264); }
      }
      if (s0 === peg$FAILED) {
        if (input.substr(peg$currPos, 3).toLowerCase() === peg$c265) {
          s0 = input.substr(peg$currPos, 3);
          peg$currPos += 3;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c266); }
        }
        if (s0 === peg$FAILED) {
          if (input.substr(peg$currPos, 2).toLowerCase() === peg$c267) {
            s0 = input.substr(peg$currPos, 2);
            peg$currPos += 2;
          } else {
            s0 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c268); }
          }
          if (s0 === peg$FAILED) {
            if (input.substr(peg$currPos, 4).toLowerCase() === peg$c269) {
              s0 = input.substr(peg$currPos, 4);
              peg$currPos += 4;
            } else {
              s0 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c270); }
            }
          }
        }
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseuppercase_letter() {
    var s0;

    var key    = peg$currPos * 100 + 62,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    if (peg$c271.test(input.charAt(peg$currPos))) {
      s0 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c272); }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parselowercase_letter() {
    var s0;

    var key    = peg$currPos * 100 + 63,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    if (peg$c273.test(input.charAt(peg$currPos))) {
      s0 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c274); }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseletter() {
    var s0;

    var key    = peg$currPos * 100 + 64,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$parseuppercase_letter();
    if (s0 === peg$FAILED) {
      s0 = peg$parselowercase_letter();
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsecommon_variable() {
    var s0, s1, s2, s3, s4, s5;

    var key    = peg$currPos * 100 + 65,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parsecommon_prefix();
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        s3 = peg$currPos;
        s4 = [];
        s5 = peg$parseletter();
        if (s5 !== peg$FAILED) {
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseletter();
          }
        } else {
          s4 = peg$FAILED;
        }
        if (s4 !== peg$FAILED) {
          s3 = input.substring(s3, peg$currPos);
        } else {
          s3 = s4;
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c275(s1, s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseis() {
    var s0, s1, s2;

    var key    = peg$currPos * 100 + 66,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    if (input.substr(peg$currPos, 2) === peg$c276) {
      s0 = peg$c276;
      peg$currPos += 2;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c277); }
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = [];
      s2 = peg$parse_();
      while (s2 !== peg$FAILED) {
        s1.push(s2);
        s2 = peg$parse_();
      }
      if (s1 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 61) {
          s2 = peg$c278;
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c279); }
        }
        if (s2 === peg$FAILED) {
          if (input.substr(peg$currPos, 3).toLowerCase() === peg$c280) {
            s2 = input.substr(peg$currPos, 3);
            peg$currPos += 3;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c281); }
          }
          if (s2 === peg$FAILED) {
            if (input.substr(peg$currPos, 4).toLowerCase() === peg$c282) {
              s2 = input.substr(peg$currPos, 4);
              peg$currPos += 4;
            } else {
              s2 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c283); }
            }
            if (s2 === peg$FAILED) {
              if (input.substr(peg$currPos, 4).toLowerCase() === peg$c284) {
                s2 = input.substr(peg$currPos, 4);
                peg$currPos += 4;
              } else {
                s2 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c285); }
              }
              if (s2 === peg$FAILED) {
                if (input.substr(peg$currPos, 5).toLowerCase() === peg$c286) {
                  s2 = input.substr(peg$currPos, 5);
                  peg$currPos += 5;
                } else {
                  s2 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c287); }
                }
              }
            }
          }
        }
        if (s2 !== peg$FAILED) {
          s1 = [s1, s2];
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsepush() {
    var s0;

    var key    = peg$currPos * 100 + 67,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    if (input.substr(peg$currPos, 4).toLowerCase() === peg$c288) {
      s0 = input.substr(peg$currPos, 4);
      peg$currPos += 4;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c289); }
    }
    if (s0 === peg$FAILED) {
      if (input.substr(peg$currPos, 4).toLowerCase() === peg$c290) {
        s0 = input.substr(peg$currPos, 4);
        peg$currPos += 4;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c291); }
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsepop() {
    var s0;

    var key    = peg$currPos * 100 + 68,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    if (input.substr(peg$currPos, 4).toLowerCase() === peg$c292) {
      s0 = input.substr(peg$currPos, 4);
      peg$currPos += 4;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c293); }
    }
    if (s0 === peg$FAILED) {
      if (input.substr(peg$currPos, 3).toLowerCase() === peg$c294) {
        s0 = input.substr(peg$currPos, 3);
        peg$currPos += 3;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c295); }
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseinto() {
    var s0, s1, s2, s3;

    var key    = peg$currPos * 100 + 69,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parse_();
    if (s1 !== peg$FAILED) {
      if (input.substr(peg$currPos, 4).toLowerCase() === peg$c296) {
        s2 = input.substr(peg$currPos, 4);
        peg$currPos += 4;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c297); }
      }
      if (s2 === peg$FAILED) {
        if (input.substr(peg$currPos, 2).toLowerCase() === peg$c298) {
          s2 = input.substr(peg$currPos, 2);
          peg$currPos += 2;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c299); }
        }
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parse_();
        if (s3 !== peg$FAILED) {
          s1 = [s1, s2, s3];
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsedelist() {
    var s0, s1, s2, s3;

    var key    = peg$currPos * 100 + 70,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parsepop();
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        s3 = peg$parsevariable();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c300(s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parselookup() {
    var s0, s1, s2, s3, s4, s5;

    var key    = peg$currPos * 100 + 71,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parsedelist();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c301(s1);
    }
    s0 = s1;
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parsevariable();
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          if (input.substr(peg$currPos, 2).toLowerCase() === peg$c302) {
            s3 = input.substr(peg$currPos, 2);
            peg$currPos += 2;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c303); }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parse_();
            if (s4 !== peg$FAILED) {
              s5 = peg$parsenor();
              if (s5 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c304(s1, s5);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        s1 = peg$parsevariable();
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c305(s1);
        }
        s0 = s1;
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseindexer() {
    var s0, s1, s2, s3, s4;

    var key    = peg$currPos * 100 + 72,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parse_();
    if (s1 !== peg$FAILED) {
      if (input.substr(peg$currPos, 2).toLowerCase() === peg$c302) {
        s2 = input.substr(peg$currPos, 2);
        peg$currPos += 2;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c303); }
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parse_();
        if (s3 !== peg$FAILED) {
          s4 = peg$parsenor();
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c306(s4);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseassignable() {
    var s0, s1, s2;

    var key    = peg$currPos * 100 + 73,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parsevariable();
    if (s1 !== peg$FAILED) {
      s2 = peg$parseindexer();
      if (s2 === peg$FAILED) {
        s2 = null;
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c307(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseassignment() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    var key    = peg$currPos * 100 + 74,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parseassignable();
    if (s1 !== peg$FAILED) {
      s2 = peg$parseis();
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parse_();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parse_();
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseliteral();
          if (s4 === peg$FAILED) {
            s4 = peg$parsepoetic_number();
          }
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c308(s1, s4);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parseassignable();
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          if (input.substr(peg$currPos, 5).toLowerCase() === peg$c309) {
            s3 = input.substr(peg$currPos, 5);
            peg$currPos += 5;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c310); }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parsepoetic_string();
            if (s4 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c308(s1, s4);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 3).toLowerCase() === peg$c311) {
          s1 = input.substr(peg$currPos, 3);
          peg$currPos += 3;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c312); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parse_();
          if (s2 !== peg$FAILED) {
            s3 = peg$parsenor();
            if (s3 !== peg$FAILED) {
              s4 = peg$parseinto();
              if (s4 !== peg$FAILED) {
                s5 = peg$parseassignable();
                if (s5 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c313(s3, s5);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.substr(peg$currPos, 3).toLowerCase() === peg$c314) {
            s1 = input.substr(peg$currPos, 3);
            peg$currPos += 3;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c315); }
          }
          if (s1 !== peg$FAILED) {
            s2 = peg$parse_();
            if (s2 !== peg$FAILED) {
              s3 = peg$parseassignable();
              if (s3 !== peg$FAILED) {
                s4 = peg$parse_();
                if (s4 !== peg$FAILED) {
                  if (input.substr(peg$currPos, 2).toLowerCase() === peg$c316) {
                    s5 = input.substr(peg$currPos, 2);
                    peg$currPos += 2;
                  } else {
                    s5 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c317); }
                  }
                  if (s5 !== peg$FAILED) {
                    s6 = peg$parsecompoundable_operator();
                    if (s6 !== peg$FAILED) {
                      s7 = peg$parsenor();
                      if (s7 !== peg$FAILED) {
                        peg$savedPos = s0;
                        s1 = peg$c318(s3, s6, s7);
                        s0 = s1;
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            if (input.substr(peg$currPos, 3).toLowerCase() === peg$c314) {
              s1 = input.substr(peg$currPos, 3);
              peg$currPos += 3;
            } else {
              s1 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c315); }
            }
            if (s1 !== peg$FAILED) {
              s2 = peg$parse_();
              if (s2 !== peg$FAILED) {
                s3 = peg$parseassignable();
                if (s3 !== peg$FAILED) {
                  s4 = peg$parse_();
                  if (s4 !== peg$FAILED) {
                    if (input.substr(peg$currPos, 2).toLowerCase() === peg$c316) {
                      s5 = input.substr(peg$currPos, 2);
                      peg$currPos += 2;
                    } else {
                      s5 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c317); }
                    }
                    if (s5 !== peg$FAILED) {
                      s6 = peg$parse_();
                      if (s6 !== peg$FAILED) {
                        s7 = peg$parsenor();
                        if (s7 !== peg$FAILED) {
                          peg$savedPos = s0;
                          s1 = peg$c319(s3, s7);
                          s0 = s1;
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
            if (s0 === peg$FAILED) {
              s0 = peg$currPos;
              s1 = peg$parsepush();
              if (s1 !== peg$FAILED) {
                s2 = peg$parse_();
                if (s2 !== peg$FAILED) {
                  s3 = peg$parsenor();
                  if (s3 !== peg$FAILED) {
                    s4 = peg$parseinto();
                    if (s4 !== peg$FAILED) {
                      s5 = peg$parsevariable();
                      if (s5 !== peg$FAILED) {
                        peg$savedPos = s0;
                        s1 = peg$c320(s3, s5);
                        s0 = s1;
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
              if (s0 === peg$FAILED) {
                s0 = peg$currPos;
                s1 = peg$parsepush();
                if (s1 !== peg$FAILED) {
                  s2 = peg$parse_();
                  if (s2 !== peg$FAILED) {
                    s3 = peg$parsevariable();
                    if (s3 !== peg$FAILED) {
                      s4 = peg$parse_();
                      if (s4 !== peg$FAILED) {
                        if (input.substr(peg$currPos, 4).toLowerCase() === peg$c321) {
                          s5 = input.substr(peg$currPos, 4);
                          peg$currPos += 4;
                        } else {
                          s5 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c322); }
                        }
                        if (s5 !== peg$FAILED) {
                          s6 = peg$parse_();
                          if (s6 !== peg$FAILED) {
                            s7 = peg$parseliteral();
                            if (s7 === peg$FAILED) {
                              s7 = peg$parsepoetic_number();
                            }
                            if (s7 !== peg$FAILED) {
                              peg$savedPos = s0;
                              s1 = peg$c323(s3, s7);
                              s0 = s1;
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
                if (s0 === peg$FAILED) {
                  s0 = peg$currPos;
                  s1 = peg$parsepush();
                  if (s1 !== peg$FAILED) {
                    s2 = peg$parse_();
                    if (s2 !== peg$FAILED) {
                      s3 = peg$parsevariable();
                      if (s3 !== peg$FAILED) {
                        s4 = peg$currPos;
                        s5 = peg$parse_();
                        if (s5 !== peg$FAILED) {
                          if (input.substr(peg$currPos, 4).toLowerCase() === peg$c324) {
                            s6 = input.substr(peg$currPos, 4);
                            peg$currPos += 4;
                          } else {
                            s6 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c325); }
                          }
                          if (s6 !== peg$FAILED) {
                            s5 = [s5, s6];
                            s4 = s5;
                          } else {
                            peg$currPos = s4;
                            s4 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s4;
                          s4 = peg$FAILED;
                        }
                        if (s4 === peg$FAILED) {
                          s4 = null;
                        }
                        if (s4 !== peg$FAILED) {
                          s5 = peg$parse_();
                          if (s5 !== peg$FAILED) {
                            s6 = peg$parsenor();
                            if (s6 !== peg$FAILED) {
                              peg$savedPos = s0;
                              s1 = peg$c323(s3, s6);
                              s0 = s1;
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                  if (s0 === peg$FAILED) {
                    s0 = peg$currPos;
                    s1 = peg$parsepush();
                    if (s1 !== peg$FAILED) {
                      s2 = peg$parse_();
                      if (s2 !== peg$FAILED) {
                        s3 = peg$parsevariable();
                        if (s3 !== peg$FAILED) {
                          peg$savedPos = s0;
                          s1 = peg$c326(s3);
                          s0 = s1;
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                    if (s0 === peg$FAILED) {
                      s0 = peg$currPos;
                      s1 = peg$parsedelist();
                      if (s1 !== peg$FAILED) {
                        s2 = peg$parseinto();
                        if (s2 !== peg$FAILED) {
                          s3 = peg$parseassignable();
                          if (s3 !== peg$FAILED) {
                            peg$savedPos = s0;
                            s1 = peg$c327(s1, s3);
                            s0 = s1;
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsepoetic_string() {
    var s0, s1, s2, s3;

    var key    = peg$currPos * 100 + 75,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$currPos;
    s2 = [];
    if (peg$c328.test(input.charAt(peg$currPos))) {
      s3 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s3 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c329); }
    }
    while (s3 !== peg$FAILED) {
      s2.push(s3);
      if (peg$c328.test(input.charAt(peg$currPos))) {
        s3 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c329); }
      }
    }
    if (s2 !== peg$FAILED) {
      s1 = input.substring(s1, peg$currPos);
    } else {
      s1 = s2;
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c330(s1);
    }
    s0 = s1;

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsepoetic_number() {
    var s0, s1, s2, s3, s4, s5, s6;

    var key    = peg$currPos * 100 + 76,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parsepoetic_digit_separator();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parsepoetic_digit_separator();
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parsepoetic_digits();
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parsepoetic_digit_separator();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parsepoetic_digit_separator();
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parsepoetic_decimal();
          if (s4 === peg$FAILED) {
            s4 = null;
          }
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parsepoetic_digit_separator();
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$parsepoetic_digit_separator();
            }
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c331(s2, s4);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsepoetic_decimal() {
    var s0, s1, s2, s3, s4, s5;

    var key    = peg$currPos * 100 + 77,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 46) {
      s1 = peg$c130;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c131); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parsepoetic_decimal_digit_separator();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parsepoetic_decimal_digit_separator();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parsepoetic_decimal_digits();
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parsepoetic_decimal_digit_separator();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parsepoetic_decimal_digit_separator();
          }
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c332(s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 46) {
        s1 = peg$c130;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c131); }
      }
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$parsepoetic_decimal_digit_separator();
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$parsepoetic_decimal_digit_separator();
        }
        if (s2 !== peg$FAILED) {
          s1 = [s1, s2];
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsepoetic_digit_separator() {
    var s0;

    var key    = peg$currPos * 100 + 78,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$parse_();
    if (s0 === peg$FAILED) {
      if (peg$c333.test(input.charAt(peg$currPos))) {
        s0 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c334); }
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsepoetic_digits() {
    var s0, s1, s2, s3, s4;

    var key    = peg$currPos * 100 + 79,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parsepoetic_digit_separator();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parsepoetic_digit_separator();
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parsepoetic_digit();
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parsepoetic_digit_separator();
        if (s4 !== peg$FAILED) {
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            s4 = peg$parsepoetic_digit_separator();
          }
        } else {
          s3 = peg$FAILED;
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parsepoetic_digits();
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c335(s2, s4);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parsepoetic_digit();
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c336(s1);
      }
      s0 = s1;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsepoetic_decimal_digit_separator() {
    var s0;

    var key    = peg$currPos * 100 + 80,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$parse_();
    if (s0 === peg$FAILED) {
      s0 = peg$parsepoetic_digit_separator();
      if (s0 === peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 46) {
          s0 = peg$c130;
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c131); }
        }
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsepoetic_decimal_digits() {
    var s0, s1, s2, s3, s4;

    var key    = peg$currPos * 100 + 81,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parsepoetic_decimal_digit_separator();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parsepoetic_decimal_digit_separator();
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parsepoetic_digit();
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parsepoetic_decimal_digit_separator();
        if (s4 !== peg$FAILED) {
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            s4 = peg$parsepoetic_decimal_digit_separator();
          }
        } else {
          s3 = peg$FAILED;
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parsepoetic_decimal_digits();
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c335(s2, s4);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parsepoetic_digit();
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c336(s1);
      }
      s0 = s1;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsepoetic_digit() {
    var s0, s1, s2;

    var key    = peg$currPos * 100 + 82,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = [];
    if (peg$c337.test(input.charAt(peg$currPos))) {
      s2 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s2 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c338); }
    }
    if (s2 !== peg$FAILED) {
      while (s2 !== peg$FAILED) {
        s1.push(s2);
        if (peg$c337.test(input.charAt(peg$currPos))) {
          s2 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c338); }
        }
      }
    } else {
      s1 = peg$FAILED;
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c339(s1);
    }
    s0 = s1;

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsevariable() {
    var s0;

    var key    = peg$currPos * 100 + 83,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$parsecommon_variable();
    if (s0 === peg$FAILED) {
      s0 = peg$parseproper_variable();
      if (s0 === peg$FAILED) {
        s0 = peg$parsepronoun();
        if (s0 === peg$FAILED) {
          s0 = peg$parsesimple_variable();
        }
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsesimple_variable() {
    var s0, s1, s2, s3, s4, s5;

    var key    = peg$currPos * 100 + 84,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$currPos;
    s2 = peg$currPos;
    s3 = peg$parseletter();
    if (s3 !== peg$FAILED) {
      s4 = [];
      s5 = peg$parseletter();
      while (s5 !== peg$FAILED) {
        s4.push(s5);
        s5 = peg$parseletter();
      }
      if (s4 !== peg$FAILED) {
        s3 = [s3, s4];
        s2 = s3;
      } else {
        peg$currPos = s2;
        s2 = peg$FAILED;
      }
    } else {
      peg$currPos = s2;
      s2 = peg$FAILED;
    }
    if (s2 !== peg$FAILED) {
      s1 = input.substring(s1, peg$currPos);
    } else {
      s1 = s2;
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = peg$currPos;
      s2 = peg$c340(s1);
      if (s2) {
        s2 = peg$FAILED;
      } else {
        s2 = void 0;
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c341(s1);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseproper_noun() {
    var s0, s1, s2, s3, s4, s5;

    var key    = peg$currPos * 100 + 85,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$currPos;
    s2 = peg$currPos;
    s3 = peg$parseuppercase_letter();
    if (s3 !== peg$FAILED) {
      s4 = [];
      s5 = peg$parseletter();
      while (s5 !== peg$FAILED) {
        s4.push(s5);
        s5 = peg$parseletter();
      }
      if (s4 !== peg$FAILED) {
        s3 = [s3, s4];
        s2 = s3;
      } else {
        peg$currPos = s2;
        s2 = peg$FAILED;
      }
    } else {
      peg$currPos = s2;
      s2 = peg$FAILED;
    }
    if (s2 !== peg$FAILED) {
      s1 = input.substring(s1, peg$currPos);
    } else {
      s1 = s2;
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = peg$currPos;
      s2 = peg$c342(s1);
      if (s2) {
        s2 = peg$FAILED;
      } else {
        s2 = void 0;
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c343(s1);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseproper_variable() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8;

    var key    = peg$currPos * 100 + 86,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$currPos;
    s2 = peg$currPos;
    s3 = peg$parseproper_noun();
    if (s3 !== peg$FAILED) {
      s4 = [];
      s5 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 32) {
        s6 = peg$c344;
        peg$currPos++;
      } else {
        s6 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c345); }
      }
      if (s6 !== peg$FAILED) {
        s7 = peg$currPos;
        s8 = peg$parseproper_noun();
        if (s8 !== peg$FAILED) {
          s7 = input.substring(s7, peg$currPos);
        } else {
          s7 = s8;
        }
        if (s7 !== peg$FAILED) {
          s6 = [s6, s7];
          s5 = s6;
        } else {
          peg$currPos = s5;
          s5 = peg$FAILED;
        }
      } else {
        peg$currPos = s5;
        s5 = peg$FAILED;
      }
      while (s5 !== peg$FAILED) {
        s4.push(s5);
        s5 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 32) {
          s6 = peg$c344;
          peg$currPos++;
        } else {
          s6 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c345); }
        }
        if (s6 !== peg$FAILED) {
          s7 = peg$currPos;
          s8 = peg$parseproper_noun();
          if (s8 !== peg$FAILED) {
            s7 = input.substring(s7, peg$currPos);
          } else {
            s7 = s8;
          }
          if (s7 !== peg$FAILED) {
            s6 = [s6, s7];
            s5 = s6;
          } else {
            peg$currPos = s5;
            s5 = peg$FAILED;
          }
        } else {
          peg$currPos = s5;
          s5 = peg$FAILED;
        }
      }
      if (s4 !== peg$FAILED) {
        s3 = [s3, s4];
        s2 = s3;
      } else {
        peg$currPos = s2;
        s2 = peg$FAILED;
      }
    } else {
      peg$currPos = s2;
      s2 = peg$FAILED;
    }
    if (s2 !== peg$FAILED) {
      s1 = input.substring(s1, peg$currPos);
    } else {
      s1 = s2;
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c346(s1);
    }
    s0 = s1;

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsecrement() {
    var s0;

    var key    = peg$currPos * 100 + 87,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$parseincrement();
    if (s0 === peg$FAILED) {
      s0 = peg$parsedecrement();
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseincrement() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9;

    var key    = peg$currPos * 100 + 88,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c347) {
      s1 = input.substr(peg$currPos, 5);
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c348); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        s3 = peg$parsevariable();
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$currPos;
            if (input.substr(peg$currPos, 2).toLowerCase() === peg$c349) {
              s7 = input.substr(peg$currPos, 2);
              peg$currPos += 2;
            } else {
              s7 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c350); }
            }
            if (s7 !== peg$FAILED) {
              s8 = [];
              s9 = peg$parsenoise();
              while (s9 !== peg$FAILED) {
                s8.push(s9);
                s9 = peg$parsenoise();
              }
              if (s8 !== peg$FAILED) {
                s7 = [s7, s8];
                s6 = s7;
              } else {
                peg$currPos = s6;
                s6 = peg$FAILED;
              }
            } else {
              peg$currPos = s6;
              s6 = peg$FAILED;
            }
            if (s6 !== peg$FAILED) {
              while (s6 !== peg$FAILED) {
                s5.push(s6);
                s6 = peg$currPos;
                if (input.substr(peg$currPos, 2).toLowerCase() === peg$c349) {
                  s7 = input.substr(peg$currPos, 2);
                  peg$currPos += 2;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c350); }
                }
                if (s7 !== peg$FAILED) {
                  s8 = [];
                  s9 = peg$parsenoise();
                  while (s9 !== peg$FAILED) {
                    s8.push(s9);
                    s9 = peg$parsenoise();
                  }
                  if (s8 !== peg$FAILED) {
                    s7 = [s7, s8];
                    s6 = s7;
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s6;
                  s6 = peg$FAILED;
                }
              }
            } else {
              s5 = peg$FAILED;
            }
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c351(s3, s5);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsedecrement() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9;

    var key    = peg$currPos * 100 + 89,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c352) {
      s1 = input.substr(peg$currPos, 5);
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c353); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        s3 = peg$parsevariable();
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$currPos;
            if (input.substr(peg$currPos, 4).toLowerCase() === peg$c354) {
              s7 = input.substr(peg$currPos, 4);
              peg$currPos += 4;
            } else {
              s7 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c355); }
            }
            if (s7 !== peg$FAILED) {
              s8 = [];
              s9 = peg$parsenoise();
              while (s9 !== peg$FAILED) {
                s8.push(s9);
                s9 = peg$parsenoise();
              }
              if (s8 !== peg$FAILED) {
                s7 = [s7, s8];
                s6 = s7;
              } else {
                peg$currPos = s6;
                s6 = peg$FAILED;
              }
            } else {
              peg$currPos = s6;
              s6 = peg$FAILED;
            }
            if (s6 !== peg$FAILED) {
              while (s6 !== peg$FAILED) {
                s5.push(s6);
                s6 = peg$currPos;
                if (input.substr(peg$currPos, 4).toLowerCase() === peg$c354) {
                  s7 = input.substr(peg$currPos, 4);
                  peg$currPos += 4;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c355); }
                }
                if (s7 !== peg$FAILED) {
                  s8 = [];
                  s9 = peg$parsenoise();
                  while (s9 !== peg$FAILED) {
                    s8.push(s9);
                    s9 = peg$parsenoise();
                  }
                  if (s8 !== peg$FAILED) {
                    s7 = [s7, s8];
                    s6 = s7;
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s6;
                  s6 = peg$FAILED;
                }
              }
            } else {
              s5 = peg$FAILED;
            }
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c356(s3, s5);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsesplit() {
    var s0, s1;

    var key    = peg$currPos * 100 + 90,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 3).toLowerCase() === peg$c357) {
      s1 = input.substr(peg$currPos, 3);
      peg$currPos += 3;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c358); }
    }
    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 5).toLowerCase() === peg$c359) {
        s1 = input.substr(peg$currPos, 5);
        peg$currPos += 5;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c360); }
      }
      if (s1 === peg$FAILED) {
        if (input.substr(peg$currPos, 7).toLowerCase() === peg$c361) {
          s1 = input.substr(peg$currPos, 7);
          peg$currPos += 7;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c362); }
        }
      }
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c363();
    }
    s0 = s1;

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsecast() {
    var s0, s1;

    var key    = peg$currPos * 100 + 91,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 4).toLowerCase() === peg$c364) {
      s1 = input.substr(peg$currPos, 4);
      peg$currPos += 4;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c365); }
    }
    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 4).toLowerCase() === peg$c366) {
        s1 = input.substr(peg$currPos, 4);
        peg$currPos += 4;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c367); }
      }
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c368();
    }
    s0 = s1;

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsejoin() {
    var s0, s1;

    var key    = peg$currPos * 100 + 92,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 4).toLowerCase() === peg$c369) {
      s1 = input.substr(peg$currPos, 4);
      peg$currPos += 4;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c370); }
    }
    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 5).toLowerCase() === peg$c371) {
        s1 = input.substr(peg$currPos, 5);
        peg$currPos += 5;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c372); }
      }
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c373();
    }
    s0 = s1;

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsemutator() {
    var s0;

    var key    = peg$currPos * 100 + 93,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$parsesplit();
    if (s0 === peg$FAILED) {
      s0 = peg$parsecast();
      if (s0 === peg$FAILED) {
        s0 = peg$parsejoin();
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsemodifier() {
    var s0, s1, s2, s3, s4;

    var key    = peg$currPos * 100 + 94,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parse_();
    if (s1 !== peg$FAILED) {
      if (input.substr(peg$currPos, 4).toLowerCase() === peg$c324) {
        s2 = input.substr(peg$currPos, 4);
        peg$currPos += 4;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c325); }
      }
      if (s2 === peg$FAILED) {
        if (input.substr(peg$currPos, 5).toLowerCase() === peg$c374) {
          s2 = input.substr(peg$currPos, 5);
          peg$currPos += 5;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c375); }
        }
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parse_();
        if (s3 !== peg$FAILED) {
          s4 = peg$parsenor();
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c376(s4);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsemutation() {
    var s0, s1, s2, s3, s4, s5, s6;

    var key    = peg$currPos * 100 + 95,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parsemutator();
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        s3 = peg$parsenor();
        if (s3 !== peg$FAILED) {
          s4 = peg$parseinto();
          if (s4 !== peg$FAILED) {
            s5 = peg$parseassignable();
            if (s5 !== peg$FAILED) {
              s6 = peg$parsemodifier();
              if (s6 === peg$FAILED) {
                s6 = null;
              }
              if (s6 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c377(s1, s3, s5, s6);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parsemutator();
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseassignable();
          if (s3 !== peg$FAILED) {
            s4 = peg$parsemodifier();
            if (s4 === peg$FAILED) {
              s4 = null;
            }
            if (s4 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c378(s1, s3, s4);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parserounding() {
    var s0;

    var key    = peg$currPos * 100 + 96,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$parsefloor();
    if (s0 === peg$FAILED) {
      s0 = peg$parseceil();
      if (s0 === peg$FAILED) {
        s0 = peg$parsemath_round();
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsefloor() {
    var s0, s1, s2, s3, s4, s5;

    var key    = peg$currPos * 100 + 97,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 4).toLowerCase() === peg$c379) {
      s1 = input.substr(peg$currPos, 4);
      peg$currPos += 4;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c380); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        s3 = peg$parsevariable();
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            if (input.substr(peg$currPos, 4).toLowerCase() === peg$c354) {
              s5 = input.substr(peg$currPos, 4);
              peg$currPos += 4;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c355); }
            }
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c381(s3);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 4).toLowerCase() === peg$c379) {
        s1 = input.substr(peg$currPos, 4);
        peg$currPos += 4;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c380); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          if (input.substr(peg$currPos, 4).toLowerCase() === peg$c354) {
            s3 = input.substr(peg$currPos, 4);
            peg$currPos += 4;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c355); }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parse_();
            if (s4 !== peg$FAILED) {
              s5 = peg$parsevariable();
              if (s5 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c381(s5);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseceil() {
    var s0, s1, s2, s3, s4, s5;

    var key    = peg$currPos * 100 + 98,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 4).toLowerCase() === peg$c379) {
      s1 = input.substr(peg$currPos, 4);
      peg$currPos += 4;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c380); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        s3 = peg$parsevariable();
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            if (input.substr(peg$currPos, 2).toLowerCase() === peg$c349) {
              s5 = input.substr(peg$currPos, 2);
              peg$currPos += 2;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c350); }
            }
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c382(s3);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 4).toLowerCase() === peg$c379) {
        s1 = input.substr(peg$currPos, 4);
        peg$currPos += 4;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c380); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          if (input.substr(peg$currPos, 2).toLowerCase() === peg$c349) {
            s3 = input.substr(peg$currPos, 2);
            peg$currPos += 2;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c350); }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parse_();
            if (s4 !== peg$FAILED) {
              s5 = peg$parsevariable();
              if (s5 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c383(s5);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsemath_round() {
    var s0, s1, s2, s3, s4, s5;

    var key    = peg$currPos * 100 + 99,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 4).toLowerCase() === peg$c379) {
      s1 = input.substr(peg$currPos, 4);
      peg$currPos += 4;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c380); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        s3 = peg$parsevariable();
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            if (input.substr(peg$currPos, 5).toLowerCase() === peg$c384) {
              s5 = input.substr(peg$currPos, 5);
              peg$currPos += 5;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c385); }
            }
            if (s5 === peg$FAILED) {
              if (input.substr(peg$currPos, 6).toLowerCase() === peg$c386) {
                s5 = input.substr(peg$currPos, 6);
                peg$currPos += 6;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c387); }
              }
            }
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c388(s3);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 4).toLowerCase() === peg$c379) {
        s1 = input.substr(peg$currPos, 4);
        peg$currPos += 4;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c380); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          if (input.substr(peg$currPos, 5).toLowerCase() === peg$c384) {
            s3 = input.substr(peg$currPos, 5);
            peg$currPos += 5;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c385); }
          }
          if (s3 === peg$FAILED) {
            if (input.substr(peg$currPos, 6).toLowerCase() === peg$c386) {
              s3 = input.substr(peg$currPos, 6);
              peg$currPos += 6;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c387); }
            }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parse_();
            if (s4 !== peg$FAILED) {
              s5 = peg$parsevariable();
              if (s5 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c388(s5);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }


    /* initialiser code - this is JS that runs before the parser is generated */

    const keywords = new Set([
      // common variable prefixes
      'a', 'an', 'the', 'my', 'your',

      // pronouns
      'it', 'he', 'she', 'him', 'her', 'they', 'them', 'ze', 'hir', 'zie', 'zir', 'xe', 'xem', 've', 'ver',

      // literal values
      'mysterious',
      'null', 'nothing', 'nowhere', 'nobody', 'gone',
      'true', 'right', 'yes', 'ok',
      'false', 'wrong', 'no', 'lies',
      'maybe', 'definitely', // reserved for future use
      'empty', 'silent', 'silence',

      // assignment
      'let', 'be', 'put', 'into', 'in', // expression
      'is', 'are', 'was', 'were', 'says', // poetic

      // operations
      'at', 'rock', 'with', 'roll', 'into', 'push', 'pop', 'like', // arrays
      'cut', 'split', 'shatter', 'join', 'unite', 'cast', 'burn', // strings
      'build', 'up', 'knock', 'down', // increment/decrement
      'plus', 'with', 'minus', 'without', 'times', 'of', 'over', 'between', // arithmetic
      'and', // list arithmetic
      'turn', 'up', 'down', 'round', 'around', // rounding
      'and', 'or', 'nor', 'not', // logical

      // comparison
      'is', "isn't", 'isnt', "ain't", 'aint', 'not',
      'than',
      'higher', 'greater', 'bigger', 'stronger',
      'lower', 'less', 'smaller', 'weaker',
      'as',
      'high', 'great', 'big', 'strong',
      'low', 'little', 'small', 'weak',

      // input/output
      'listen', 'to',
      'say', 'shout', 'whisper', 'scream',

      // control flow
      'if', 'else',
      'while', 'until',
      'break', 'continue',
      'break', 'it', 'down',
      'take', 'it', 'to', 'the', 'top',
      'take',

      // functions
      'takes', 'wants',
      'give', 'return', 'send', 'back',
      'taking',
    ])

    function isKeyword(string) {
      return keywords.has(string.toLowerCase());
    }


  peg$result = peg$startRuleFunction();

  if (peg$result !== peg$FAILED && peg$currPos === input.length) {
    return peg$result;
  } else {
    if (peg$result !== peg$FAILED && peg$currPos < input.length) {
      peg$fail(peg$endExpectation());
    }

    throw peg$buildStructuredError(
      peg$maxFailExpected,
      peg$maxFailPos < input.length ? input.charAt(peg$maxFailPos) : null,
      peg$maxFailPos < input.length
        ? peg$computeLocation(peg$maxFailPos, peg$maxFailPos + 1)
        : peg$computeLocation(peg$maxFailPos, peg$maxFailPos)
    );
  }
}

module.exports = {
  SyntaxError: peg$SyntaxError,
  parse:       peg$parse
};

},{}]},{},[2])(2)
});
