(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*

HTML PROTOTYPE:
<div class='entitygame'>
  <pre class='entitygame_output'></pre>
  <input class='entitygame_input' />
</div>

*/

// Requires
const EventEmitter = require('events')
const TickyText = require('./TickyText')
const TTSQueue = require('./TTSQueue')
const ContractionQueue = require('../src/ContractionQueue')
const {sentencify} = require('../src/util/spellcheck')


/**
 * @class GameIO
 * @constructor
 * @extends EventEmitter
 * @param {Object} options
 * @param {Boolean} options.useTickyText
 * @param {Boolean} options.useResponsiveVoice
*/
/**
  * The DOM object for the GameIO's main DIV element.
  * @property div
  * @type {DOMElement}
  */
/**
  * A function used to write a string to the DIV, but not to send it to TTS.
  * Used for both game output and for user input.
  * @property monitor
  * @type {Function}
*/


class GameIO extends EventEmitter {
  constructor(options={} /*options*/) {
    super()

    this.printQueue = new ContractionQueue

    // creates the HTML/DOM interface
    this.div = this.makeHTML(options)

    this.on('output', str => this.monitor(str))

    if(options.useResponsiveVoice) {
      if(window.responsiveVoice) {
        this.ttsq = new TTSQueue(window.responsiveVoice)
        this.on('output', str => {
          this.ttsq.speak(str, 'UK English Male', {pitch:1/2})
        })
        this.ttsq.on('finish', () => this.printNext())
      } else {
        console.warn("Couldn't find responsiveVoice")
      }
    }
  }

  /**
    Create a DOM/HTML object for the interface
    @method makeHTML
    @return {DOMElement}
  */
  makeHTML({useTickyText}) {
    // create the HTML/DOM interface

    // create the main <div> element
    let main_div = document.createElement('DIV')
    main_div.className = 'entitygame'

    // create output <pre> element
    let output_pre = document.createElement('pre')
    output_pre.className = 'entitygame_output'
    main_div.appendChild(output_pre)

    // create input <input> element
    let input_input = document.createElement('input')
    input_input.className = 'entitygame_input'
    main_div.appendChild(input_input)

    // set up input event listener
    input_input.addEventListener('keypress', e => {
      if(e.keyCode == 13) {
        this.input(input_input.value)
        input_input.value = ''
      }
    })

    // set up output function
    if(!useTickyText)
      this.monitor = str => output_pre.innerHTML += str
    else {
      let ticker = new TickyText(output_pre)
      this.monitor = str => ticker.write(str)
      this.tickyText = ticker
      this.tickyText.on('finish', () => this.printNext())
    }

    // set up auto focus
    input_input.focus()
    main_div.addEventListener('click', () => input_input.focus())

    // return main <div>
    return main_div
  }

  input(str) {
    this.monitor('\n> '+str + '\n')

    /**
      An `input` event is emitted whenever the user sends input to the game.
      @event input
      @param {String} str The string entered by the user.
    */

    // emit an input event
    this.emit('input', str)
  }

  /**
    Called by external objects to write information to the string
    @method write
    @param {String} str The string to be printed
    @return {null}
  */
  write(str) {
    /**
      An `output` event is emitted whenever the game sends output to the screen.
      This event is not emitted when writing user input to the screen.
      @event output
      @param {String} str The string to be printed to the screen.
    */

    // emit an output event
    this.emit('output', str)
  }

  /**
    Send a string (with appended newline character) to the output
    @method writeln
    @param {String} str The line to output.
    @return {null}
  */
  writeln(str) {
    this.write(str+'\n')
  }
  writeSentence(str) {
    this.write(sentencify(str) + ' ')
  }

  print(...stuff) {
    stuff = stuff.filter(thing => !thing.banal)
    this.printQueue.add(...stuff)
    this.printNext()
  }
  println(...stuff) {
    this.print(...stuff, '\n')
  }

  printNext() {
    if((!this.ttsq || !this.ttsq.nowPlaying) &&
       (!this.tickyText || this.tickyText.queue.length == 0)) {
      let next = this.printQueue.next()
      if(next) {
        if(next.constructor == String)
          this.write(next)
        else if(next.isSubstitution)
          this.writeSentence(next.str(this.descriptionCtx))
        else if(next.isSentax || next.isSubjectContractedSentax)
          this.writeSentence(next.str(this.descriptionCtx))
        else
          console.warn('unable to print:', next)
      }
    }
  }
}
module.exports = GameIO

},{"../src/ContractionQueue":14,"../src/util/spellcheck":74,"./TTSQueue":2,"./TickyText":3,"events":362}],2:[function(require,module,exports){
const EventEmitter = require('events')

/**
  A class for scheduling text to speech in a queue using the Responsive Voice
  API.

  @class TTSQueue
  @constructor
  @extends EventEmitter
  @param {ResponsiveVoice} responsiveVoice
*/

class TTSQueue extends EventEmitter {
  constructor(responsiveVoice) {
    super()
    /**
     * An array of triplets: (text, voice, parameters) which are scheduled to
     * be sent to responsive voice consequetively.
     * @property {Array} queue
     */
    this.queue = []
    this.nowPlaying = null
    this.rv = responsiveVoice
  }

  /**
   * Play an utterance, or add it to the end of the queue.
   * @method speak
   * @param {String} text
   * @param {String} voice
   * @param {Object} parameters Parameters for configuring responsive voice.
   */
  speak(text, voice, parameters) {
    if(!(/\w/).test(text))
      return "nah"

    if(this.nowPlaying)
      this.queue.push([text, voice, parameters])
    else
      this.playNow(text, voice, parameters)
  }

  /**
   * Play an utterance immediately.
   * @method playNow
   * @param {String} text
   * @param {String} voice
   * @param {Object} parameters Parameters for configuring responsive voice.
   */
  playNow(text, voice, parameters) {
    parameters = Object.assign({}, parameters)
    parameters.onend = () => this.next()
    this.rv.speak(text, voice, parameters)
    this.nowPlaying = [text, voice, parameters]
  }

  /**
   * Advance to the next utterance in the queue or call `.done()`.
   * @method next
   */
  next() {
    this.nowPlaying = null
    if(this.queue.length)
      this.playNow(...this.queue.shift())
    else
      this.done()
  }

  /**
   * Called when the end of the queue is reached.
   * @method done
   */
  done() {
    this.nowPlaying = null
    this.emit('finish')
    if(this.onDone)
      this.onDone()
  }
}
module.exports = TTSQueue

},{"events":362}],3:[function(require,module,exports){
const EventEmitter = require('events')

/**
 * A class for animating the process of writing of text to a HTML element,
 * character by character.
 * @class TickyText
 * @constructor
 * @extends EventEmitter
 * @param {DOMElement} targetElement
 */

class TickyText extends EventEmitter {
  constructor(targetElement) {
    super()

    /**
     * The queue of strings to write.
     * @property {Array} queue
     */
    this.queue = []

    /**
     * @property {Number} placeInCurrent
     */
    this.placeInCurrent = 0 // Index of next character to print from

    /**
     * @property {Timeout} intervalTimer
     */
    this.intervalTimer = null

    /**
     * @property {String} str
     */
    this.str = ""

    /**
     * milliseconds between ticks
     * @property {Number} speed
     * @default 25
     */
    this.speed = 25 // ms

    /**
     * @property {DOMElement} targetElement
     */
    this.targetElement = targetElement
  }

  /**
   * strings to add to the queue
   * @method write
   * @param {String} ...stuff
   */
  write(...stuff) {
    // add stuff to the print queue
    for(var i in stuff) {
      if(stuff[i].constructor != String)
        throw "TickyText#write expects String arguments."
      this.queue.push(stuff[i])
    }
    if(!this.intervalTimer)
      this.startTicking()
  }

  /**
   * Queue strings followed by a newline character.
   * @method writeln
   * @param {String} ...str
   */
  writeln(...str) {
    for(var i in str)
      this.write(str[i])
    this.write("\n")
  }

  /**
   * Begin printing characters to `target` and `this.str`.
   * @method startTicking
   */
  startTicking() {
    this.intervalTimer = setInterval(() => {
      this.tick()
    }, this.speed)
  }

  /**
   * Pause printing.
   * @method stopTicking
   */
  stopTicking() {
    if(this.intervalTimer)
      clearInterval(this.intervalTimer)
    this.intervalTimer = null

    if(this.onStopTicking)
      this.onStopTicking()
  }

  /**
   * Print a single character to the target.
   * @method tick
   */
  tick() {
    // read next character to string
    this.str += this.queue[0][this.placeInCurrent]

    // copy string to target element
    if(this.targetElement)
      this.targetElement.innerHTML = this.str

    // increment index in current string
    ++this.placeInCurrent
    // proceeed to next string at end. If no more strings stop ticking.
    if(this.placeInCurrent >= this.queue[0].length) {
      this.queue.shift()
      this.placeInCurrent = 0
      if(this.queue.length == 0) {
        this.stopTicking()
        this.emit('finish')
      }
    }
  }
}
module.exports = TickyText

},{"events":362}],4:[function(require,module,exports){
module.exports = {
  GameIO: require('./GameIO'),
  TickyText: require('./TickyText'),
  TTSQueue: require('./TTSQueue')
}

},{"./GameIO":1,"./TTSQueue":2,"./TickyText":3}],5:[function(require,module,exports){
'use strict';
/* eslint indent: 4 */


// Private helper class
class SubRange {
    constructor(low, high) {
        this.low = low;
        this.high = high;
        this.length = 1 + high - low;
    }

    overlaps(range) {
        return !(this.high < range.low || this.low > range.high);
    }

    touches(range) {
        return !(this.high + 1 < range.low || this.low - 1 > range.high);
    }

    // Returns inclusive combination of SubRanges as a SubRange.
    add(range) {
        return new SubRange(
            Math.min(this.low, range.low),
            Math.max(this.high, range.high)
        );
    }

    // Returns subtraction of SubRanges as an array of SubRanges.
    // (There's a case where subtraction divides it in 2)
    subtract(range) {
        if (range.low <= this.low && range.high >= this.high) {
            return [];
        } else if (range.low > this.low && range.high < this.high) {
            return [
                new SubRange(this.low, range.low - 1),
                new SubRange(range.high + 1, this.high)
            ];
        } else if (range.low <= this.low) {
            return [new SubRange(range.high + 1, this.high)];
        } else {
            return [new SubRange(this.low, range.low - 1)];
        }
    }

    toString() {
        return this.low == this.high ?
            this.low.toString() : this.low + '-' + this.high;
    }
}


class DRange {
    constructor(a, b) {
        this.ranges = [];
        this.length = 0;
        if (a != null) this.add(a, b);
    }

    _update_length() {
        this.length = this.ranges.reduce((previous, range) => {
            return previous + range.length;
        }, 0);
    }

    add(a, b) {
        var _add = (subrange) => {
            var i = 0;
            while (i < this.ranges.length && !subrange.touches(this.ranges[i])) {
                i++;
            }
            var newRanges = this.ranges.slice(0, i);
            while (i < this.ranges.length && subrange.touches(this.ranges[i])) {
                subrange = subrange.add(this.ranges[i]);
                i++;
            }
            newRanges.push(subrange);
            this.ranges = newRanges.concat(this.ranges.slice(i));
            this._update_length();
        }

        if (a instanceof DRange) {
            a.ranges.forEach(_add);
        } else {
            if (b == null) b = a;
            _add(new SubRange(a, b));
        }
        return this;
    }

    subtract(a, b) {
        var _subtract = (subrange) => {
            var i = 0;
            while (i < this.ranges.length && !subrange.overlaps(this.ranges[i])) {
                i++;
            }
            var newRanges = this.ranges.slice(0, i);
            while (i < this.ranges.length && subrange.overlaps(this.ranges[i])) {
                newRanges = newRanges.concat(this.ranges[i].subtract(subrange));
                i++;
            }
            this.ranges = newRanges.concat(this.ranges.slice(i));
            this._update_length();
        };

        if (a instanceof DRange) {
            a.ranges.forEach(_subtract);
        } else {
            if (b == null) b = a;
            _subtract(new SubRange(a, b));
        }
        return this;
    }

    intersect(a, b) {
        var newRanges = [];
        var _intersect = (subrange) => {
            var i = 0;
            while (i < this.ranges.length && !subrange.overlaps(this.ranges[i])) {
                i++;
            }
            while (i < this.ranges.length && subrange.overlaps(this.ranges[i])) {
                var low = Math.max(this.ranges[i].low, subrange.low);
                var high = Math.min(this.ranges[i].high, subrange.high);
                newRanges.push(new SubRange(low, high));
                i++;
            }
        };

        if (a instanceof DRange) {
            a.ranges.forEach(_intersect);
        } else {
            if (b == null) b = a;
            _intersect(new SubRange(a, b));
        }
        this.ranges = newRanges;
        this._update_length();
        return this;
    }

    index(index) {
        var i = 0;
        while (i < this.ranges.length && this.ranges[i].length <= index) {
            index -= this.ranges[i].length;
            i++;
        }
        return this.ranges[i].low + index;
    }

    toString() {
        return '[ ' + this.ranges.join(', ') + ' ]';
    }

    clone() {
        return new DRange(this);
    }

    numbers() {
        return this.ranges.reduce((result, subrange) => {
            var i = subrange.low;
            while (i <= subrange.high) {
                result.push(i);
                i++;
            }
            return result;
        }, []);
    }

    subranges() {
        return this.ranges.map((subrange) => ({
            low: subrange.low,
            high: subrange.high,
            length: 1 + subrange.high - subrange.low
        }));
    }
}

module.exports = DRange;

},{}],6:[function(require,module,exports){
"use strict";

const CARDINALS = [
  null,
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen"
]

const CARDINALS_1 = [
  null,
  null,
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety"
]

const CARDINAL_EXPONENTS = [
  null,
  null,
  "Hundred",
  "Thousand",
  null,
  null,
  "Million",
  null,
  null,
  "Billion",
  null,
  null,
  "Trillion",
  null,
  null
]

const isnotempty = function (possibly_empty) {
  return possibly_empty !== null && possibly_empty !== "";
}

const digit_meta = function(n) {
  var meta = {
    power: 0,
    exponent: 0,
    digit: 0,
  }
  if (n === 0) { return meta; }

  meta.power = Math.floor(n).toString().length - 1;
  meta.exponent = Math.pow(10, meta.power);
  meta.digit = Math.floor(n / meta.exponent);

  return meta;
}

const digit_cardinal = function(digit, cardinal_array) {
  return cardinal_array[digit];
}

const cardinalize = function(n) {
  var greater_than_ninety_nine = n > 99;
  var cardinals = [];
  var meta = "";
  var cardinal = "";

  if (n === 0) {
    return null;
  }

  if (greater_than_ninety_nine) {
    meta = digit_meta(n);
    cardinal = digit_cardinal(meta.digit, CARDINALS);
    cardinals.push(cardinal);
    cardinals.push("Hundred");
    n -= meta.digit * meta.exponent;
  }

  if (n === 0) {
    return cardinals.join(" ");
  }

  if (greater_than_ninety_nine) {
    cardinals.push("and");
  }

  if (n < CARDINALS.length) {
    cardinals.push(CARDINALS[n]);
  } else {
    meta = digit_meta(n);
    var cardinal_teen = digit_cardinal(meta.digit, CARDINALS_1);

    n -= meta.digit * meta.exponent;

    meta = digit_meta(n);
    var cardinal_unit = digit_cardinal(meta.digit, CARDINALS);

    cardinals.push([cardinal_teen, cardinal_unit].filter(isnotempty).join("-"));
  }

  return cardinals.join(" ");
}

const decimal_to_cardinal = function (n) {
  if (n === 0) return "Zero";
  var meta = digit_meta(n);
  var nameable_powers = Math.floor(meta.power / 3);
  var cardinals = [];


  for (var nameable_power = 0; nameable_power <= nameable_powers * 3; nameable_power += 3) {
    var nameable_unit = n;


    // Remove high digits
    while (meta.power >= nameable_power + 3) {
      nameable_unit -= meta.digit * meta.exponent;
      meta = digit_meta(nameable_unit);
    }

    // Remove low digits
    if (nameable_unit > 999) {
      nameable_unit = Math.floor(nameable_unit / Math.pow(10, nameable_power));
    }

    cardinals.unshift([cardinalize(nameable_unit), CARDINAL_EXPONENTS[nameable_power]].filter(isnotempty).join(" "));

    // Determine whether to prepend "and"
    if (nameable_unit !== 0 && (nameable_unit % 100 === 0 || nameable_unit < 100) && nameable_power === 0 && nameable_powers > 0) {
      cardinals[0] = "and " + cardinals[0];
    }
  }

  return cardinals.filter(isnotempty).join(", ");
};

module.exports = decimal_to_cardinal;

},{}],7:[function(require,module,exports){
"use strict";

const english = require("integer-to-cardinal-english");

const irregulars = {
  "One": "First",
  "Two": "Second",
  "Three": "Third",
  "Five": "Fifth",
  "Eight": "Eighth",
  "Nine": "Ninth",
  "Twelve": "Twelfth",
}

function ordinal(input) {
  switch(typeof(input)) {
    case "number":
      var cardinal = english(input);
      break;
    case "string":
      // Assume that the string is already a cardinal
      var cardinal = input;
      break;
    default:
      throw new Error("Arguments must either be an integer or a cardinal string");
  }

  var words = cardinal.split(" ");
  var last_word = words.pop();
  var compounds = last_word.split("-");
  var last_compound = compounds.pop();

  if (last_compound in irregulars) {
    compounds.push(irregulars[last_compound]) // Dictionary lookup of ordinals
  } else {
    if (last_compound[last_compound.length - 1] === "y") {
      compounds.push(last_compound.slice(0, -1) + "ieth"); // Eighty --> Eightieth
    } else {
      compounds.push(last_compound + "th");  // "Regular" ordinalization
    }
  }

  words.push(compounds.join("-"));
  return words.join(" ");
}

module.exports = ordinal;

},{"integer-to-cardinal-english":6}],8:[function(require,module,exports){
const ret    = require('ret');
const DRange = require('drange');
const types  = ret.types;


module.exports = class RandExp {
  /**
   * @constructor
   * @param {RegExp|String} regexp
   * @param {String} m
   */
  constructor(regexp, m) {
    this._setDefaults(regexp);
    if (regexp instanceof RegExp) {
      this.ignoreCase = regexp.ignoreCase;
      this.multiline = regexp.multiline;
      regexp = regexp.source;

    } else if (typeof regexp === 'string') {
      this.ignoreCase = m && m.indexOf('i') !== -1;
      this.multiline = m && m.indexOf('m') !== -1;
    } else {
      throw new Error('Expected a regexp or string');
    }

    this.tokens = ret(regexp);
  }


  /**
   * Checks if some custom properties have been set for this regexp.
   *
   * @param {RandExp} randexp
   * @param {RegExp} regexp
   */
  _setDefaults(regexp) {
    // When a repetitional token has its max set to Infinite,
    // randexp won't actually generate a random amount between min and Infinite
    // instead it will see Infinite as min + 100.
    this.max = regexp.max != null ? regexp.max :
      RandExp.prototype.max != null ? RandExp.prototype.max : 100;

    // This allows expanding to include additional characters
    // for instance: RandExp.defaultRange.add(0, 65535);
    this.defaultRange = regexp.defaultRange ?
      regexp.defaultRange : this.defaultRange.clone();

    if (regexp.randInt) {
      this.randInt = regexp.randInt;
    }
  }


  /**
   * Generates the random string.
   *
   * @return {String}
   */
  gen() {
    return this._gen(this.tokens, []);
  }


  /**
   * Generate random string modeled after given tokens.
   *
   * @param {Object} token
   * @param {Array.<String>} groups
   * @return {String}
   */
  _gen(token, groups) {
    var stack, str, n, i, l;

    switch (token.type) {
      case types.ROOT:
      case types.GROUP:
        // Ignore lookaheads for now.
        if (token.followedBy || token.notFollowedBy) { return ''; }

        // Insert placeholder until group string is generated.
        if (token.remember && token.groupNumber === undefined) {
          token.groupNumber = groups.push(null) - 1;
        }

        stack = token.options ?
          this._randSelect(token.options) : token.stack;

        str = '';
        for (i = 0, l = stack.length; i < l; i++) {
          str += this._gen(stack[i], groups);
        }

        if (token.remember) {
          groups[token.groupNumber] = str;
        }
        return str;

      case types.POSITION:
        // Do nothing for now.
        return '';

      case types.SET:
        var expandedSet = this._expand(token);
        if (!expandedSet.length) { return ''; }
        return String.fromCharCode(this._randSelect(expandedSet));

      case types.REPETITION:
        // Randomly generate number between min and max.
        n = this.randInt(token.min,
          token.max === Infinity ? token.min + this.max : token.max);

        str = '';
        for (i = 0; i < n; i++) {
          str += this._gen(token.value, groups);
        }

        return str;

      case types.REFERENCE:
        return groups[token.value - 1] || '';

      case types.CHAR:
        var code = this.ignoreCase && this._randBool() ?
          this._toOtherCase(token.value) : token.value;
        return String.fromCharCode(code);
    }
  }


  /**
   * If code is alphabetic, converts to other case.
   * If not alphabetic, returns back code.
   *
   * @param {Number} code
   * @return {Number}
   */
  _toOtherCase(code) {
    return code + (97 <= code && code <= 122 ? -32 :
      65 <= code && code <= 90  ?  32 : 0);
  }


  /**
   * Randomly returns a true or false value.
   *
   * @return {Boolean}
   */
  _randBool() {
    return !this.randInt(0, 1);
  }


  /**
   * Randomly selects and returns a value from the array.
   *
   * @param {Array.<Object>} arr
   * @return {Object}
   */
  _randSelect(arr) {
    if (arr instanceof DRange) {
      return arr.index(this.randInt(0, arr.length - 1));
    }
    return arr[this.randInt(0, arr.length - 1)];
  }


  /**
   * expands a token to a DiscontinuousRange of characters which has a
   * length and an index function (for random selecting)
   *
   * @param {Object} token
   * @return {DiscontinuousRange}
   */
  _expand(token) {
    if (token.type === ret.types.CHAR) {
      return new DRange(token.value);
    } else if (token.type === ret.types.RANGE) {
      return new DRange(token.from, token.to);
    } else {
      let drange = new DRange();
      for (let i = 0; i < token.set.length; i++) {
        let subrange = this._expand(token.set[i]);
        drange.add(subrange);
        if (this.ignoreCase) {
          for (let j = 0; j < subrange.length; j++) {
            let code = subrange.index(j);
            let otherCaseCode = this._toOtherCase(code);
            if (code !== otherCaseCode) {
              drange.add(otherCaseCode);
            }
          }
        }
      }
      if (token.not) {
        return this.defaultRange.clone().subtract(drange);
      } else {
        return this.defaultRange.clone().intersect(drange);
      }
    }
  }


  /**
   * Randomly generates and returns a number between a and b (inclusive).
   *
   * @param {Number} a
   * @param {Number} b
   * @return {Number}
   */
  randInt(a, b) {
    return a + Math.floor(Math.random() * (1 + b - a));
  }


  /**
   * Default range of characters to generate from.
   */
  get defaultRange() {
    return this._range = this._range || new DRange(32, 126);
  }

  set defaultRange(range) {
    this._range = range;
  }


  /**
   *
   * Enables use of randexp with a shorter call.
   *
   * @param {RegExp|String| regexp}
   * @param {String} m
   * @return {String}
   */
  static randexp(regexp, m) {
    var randexp;
    if(typeof regexp === 'string') {
      regexp = new RegExp(regexp, m);
    }

    if (regexp._randexp === undefined) {
      randexp = new RandExp(regexp, m);
      regexp._randexp = randexp;
    } else {
      randexp = regexp._randexp;
      randexp._setDefaults(regexp);
    }
    return randexp.gen();
  }


  /**
   * Enables sugary /regexp/.gen syntax.
   */
  static sugar() {
    /* eshint freeze:false */
    RegExp.prototype.gen = function() {
      return RandExp.randexp(this);
    };
  }
};

},{"drange":5,"ret":9}],9:[function(require,module,exports){
const util      = require('./util');
const types     = require('./types');
const sets      = require('./sets');
const positions = require('./positions');


module.exports = (regexpStr) => {
  var i = 0, l, c,
    start = { type: types.ROOT, stack: []},

    // Keep track of last clause/group and stack.
    lastGroup = start,
    last = start.stack,
    groupStack = [];


  var repeatErr = (i) => {
    util.error(regexpStr, `Nothing to repeat at column ${i - 1}`);
  };

  // Decode a few escaped characters.
  var str = util.strToChars(regexpStr);
  l = str.length;

  // Iterate through each character in string.
  while (i < l) {
    c = str[i++];

    switch (c) {
      // Handle escaped characters, inclues a few sets.
      case '\\':
        c = str[i++];

        switch (c) {
          case 'b':
            last.push(positions.wordBoundary());
            break;

          case 'B':
            last.push(positions.nonWordBoundary());
            break;

          case 'w':
            last.push(sets.words());
            break;

          case 'W':
            last.push(sets.notWords());
            break;

          case 'd':
            last.push(sets.ints());
            break;

          case 'D':
            last.push(sets.notInts());
            break;

          case 's':
            last.push(sets.whitespace());
            break;

          case 'S':
            last.push(sets.notWhitespace());
            break;

          default:
            // Check if c is integer.
            // In which case it's a reference.
            if (/\d/.test(c)) {
              last.push({ type: types.REFERENCE, value: parseInt(c, 10) });

            // Escaped character.
            } else {
              last.push({ type: types.CHAR, value: c.charCodeAt(0) });
            }
        }

        break;


      // Positionals.
      case '^':
        last.push(positions.begin());
        break;

      case '$':
        last.push(positions.end());
        break;


      // Handle custom sets.
      case '[':
        // Check if this class is 'anti' i.e. [^abc].
        var not;
        if (str[i] === '^') {
          not = true;
          i++;
        } else {
          not = false;
        }

        // Get all the characters in class.
        var classTokens = util.tokenizeClass(str.slice(i), regexpStr);

        // Increase index by length of class.
        i += classTokens[1];
        last.push({
          type: types.SET,
          set: classTokens[0],
          not,
        });

        break;


      // Class of any character except \n.
      case '.':
        last.push(sets.anyChar());
        break;


      // Push group onto stack.
      case '(':
        // Create group.
        var group = {
          type: types.GROUP,
          stack: [],
          remember: true,
        };

        c = str[i];

        // If if this is a special kind of group.
        if (c === '?') {
          c = str[i + 1];
          i += 2;

          // Match if followed by.
          if (c === '=') {
            group.followedBy = true;

          // Match if not followed by.
          } else if (c === '!') {
            group.notFollowedBy = true;

          } else if (c !== ':') {
            util.error(regexpStr,
              `Invalid group, character '${c}'` +
              ` after '?' at column ${i - 1}`);
          }

          group.remember = false;
        }

        // Insert subgroup into current group stack.
        last.push(group);

        // Remember the current group for when the group closes.
        groupStack.push(lastGroup);

        // Make this new group the current group.
        lastGroup = group;
        last = group.stack;
        break;


      // Pop group out of stack.
      case ')':
        if (groupStack.length === 0) {
          util.error(regexpStr, `Unmatched ) at column ${i - 1}`);
        }
        lastGroup = groupStack.pop();

        // Check if this group has a PIPE.
        // To get back the correct last stack.
        last = lastGroup.options ?
          lastGroup.options[lastGroup.options.length - 1] : lastGroup.stack;
        break;


      // Use pipe character to give more choices.
      case '|':
        // Create array where options are if this is the first PIPE
        // in this clause.
        if (!lastGroup.options) {
          lastGroup.options = [lastGroup.stack];
          delete lastGroup.stack;
        }

        // Create a new stack and add to options for rest of clause.
        var stack = [];
        lastGroup.options.push(stack);
        last = stack;
        break;


      // Repetition.
      // For every repetition, remove last element from last stack
      // then insert back a RANGE object.
      // This design is chosen because there could be more than
      // one repetition symbols in a regex i.e. `a?+{2,3}`.
      case '{':
        var rs = /^(\d+)(,(\d+)?)?\}/.exec(str.slice(i)), min, max;
        if (rs !== null) {
          if (last.length === 0) {
            repeatErr(i);
          }
          min = parseInt(rs[1], 10);
          max = rs[2] ? rs[3] ? parseInt(rs[3], 10) : Infinity : min;
          i += rs[0].length;

          last.push({
            type: types.REPETITION,
            min,
            max,
            value: last.pop(),
          });
        } else {
          last.push({
            type: types.CHAR,
            value: 123,
          });
        }
        break;

      case '?':
        if (last.length === 0) {
          repeatErr(i);
        }
        last.push({
          type: types.REPETITION,
          min: 0,
          max: 1,
          value: last.pop(),
        });
        break;

      case '+':
        if (last.length === 0) {
          repeatErr(i);
        }
        last.push({
          type: types.REPETITION,
          min: 1,
          max: Infinity,
          value: last.pop(),
        });
        break;

      case '*':
        if (last.length === 0) {
          repeatErr(i);
        }
        last.push({
          type: types.REPETITION,
          min: 0,
          max: Infinity,
          value: last.pop(),
        });
        break;


      // Default is a character that is not `\[](){}?+*^$`.
      default:
        last.push({
          type: types.CHAR,
          value: c.charCodeAt(0),
        });
    }

  }

  // Check if any groups have not been closed.
  if (groupStack.length !== 0) {
    util.error(regexpStr, 'Unterminated group');
  }

  return start;
};

module.exports.types = types;

},{"./positions":10,"./sets":11,"./types":12,"./util":13}],10:[function(require,module,exports){
const types = require('./types');
exports.wordBoundary = () => ({ type: types.POSITION, value: 'b' });
exports.nonWordBoundary = () => ({ type: types.POSITION, value: 'B' });
exports.begin = () => ({ type: types.POSITION, value: '^' });
exports.end = () => ({ type: types.POSITION, value: '$' });

},{"./types":12}],11:[function(require,module,exports){
const types = require('./types');

const INTS = () => [{ type: types.RANGE , from: 48, to: 57 }];

const WORDS = () => {
  return [
    { type: types.CHAR, value: 95 },
    { type: types.RANGE, from: 97, to: 122 },
    { type: types.RANGE, from: 65, to: 90 }
  ].concat(INTS());
};

const WHITESPACE = () => {
  return [
    { type: types.CHAR, value: 9 },
    { type: types.CHAR, value: 10 },
    { type: types.CHAR, value: 11 },
    { type: types.CHAR, value: 12 },
    { type: types.CHAR, value: 13 },
    { type: types.CHAR, value: 32 },
    { type: types.CHAR, value: 160 },
    { type: types.CHAR, value: 5760 },
    { type: types.RANGE, from: 8192, to: 8202 },
    { type: types.CHAR, value: 8232 },
    { type: types.CHAR, value: 8233 },
    { type: types.CHAR, value: 8239 },
    { type: types.CHAR, value: 8287 },
    { type: types.CHAR, value: 12288 },
    { type: types.CHAR, value: 65279 }
  ];
};

const NOTANYCHAR = () => {
  return [
    { type: types.CHAR, value: 10 },
    { type: types.CHAR, value: 13 },
    { type: types.CHAR, value: 8232 },
    { type: types.CHAR, value: 8233 },
  ];
};

// Predefined class objects.
exports.words = () => ({ type: types.SET, set: WORDS(), not: false });
exports.notWords = () => ({ type: types.SET, set: WORDS(), not: true });
exports.ints = () => ({ type: types.SET, set: INTS(), not: false });
exports.notInts = () => ({ type: types.SET, set: INTS(), not: true });
exports.whitespace = () => ({ type: types.SET, set: WHITESPACE(), not: false });
exports.notWhitespace = () => ({ type: types.SET, set: WHITESPACE(), not: true });
exports.anyChar = () => ({ type: types.SET, set: NOTANYCHAR(), not: true });

},{"./types":12}],12:[function(require,module,exports){
module.exports = {
  ROOT       : 0,
  GROUP      : 1,
  POSITION   : 2,
  SET        : 3,
  RANGE      : 4,
  REPETITION : 5,
  REFERENCE  : 6,
  CHAR       : 7,
};

},{}],13:[function(require,module,exports){
const types = require('./types');
const sets  = require('./sets');


const CTRL = '@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^ ?';
const SLSH = { '0': 0, 't': 9, 'n': 10, 'v': 11, 'f': 12, 'r': 13 };

/**
 * Finds character representations in str and convert all to
 * their respective characters
 *
 * @param {String} str
 * @return {String}
 */
exports.strToChars = function(str) {
  /* jshint maxlen: false */
  var chars_regex = /(\[\\b\])|(\\)?\\(?:u([A-F0-9]{4})|x([A-F0-9]{2})|(0?[0-7]{2})|c([@A-Z[\\\]^?])|([0tnvfr]))/g;
  str = str.replace(chars_regex, function(s, b, lbs, a16, b16, c8, dctrl, eslsh) {
    if (lbs) {
      return s;
    }

    var code = b ? 8 :
      a16   ? parseInt(a16, 16) :
      b16   ? parseInt(b16, 16) :
      c8    ? parseInt(c8,   8) :
      dctrl ? CTRL.indexOf(dctrl) :
      SLSH[eslsh];

    var c = String.fromCharCode(code);

    // Escape special regex characters.
    if (/[[\]{}^$.|?*+()]/.test(c)) {
      c = '\\' + c;
    }

    return c;
  });

  return str;
};


/**
 * turns class into tokens
 * reads str until it encounters a ] not preceeded by a \
 *
 * @param {String} str
 * @param {String} regexpStr
 * @return {Array.<Array.<Object>, Number>}
 */
exports.tokenizeClass = (str, regexpStr) => {
  /* jshint maxlen: false */
  var tokens = [];
  var regexp = /\\(?:(w)|(d)|(s)|(W)|(D)|(S))|((?:(?:\\)(.)|([^\]\\]))-(?:\\)?([^\]]))|(\])|(?:\\)?([^])/g;
  var rs, c;


  while ((rs = regexp.exec(str)) != null) {
    if (rs[1]) {
      tokens.push(sets.words());

    } else if (rs[2]) {
      tokens.push(sets.ints());

    } else if (rs[3]) {
      tokens.push(sets.whitespace());

    } else if (rs[4]) {
      tokens.push(sets.notWords());

    } else if (rs[5]) {
      tokens.push(sets.notInts());

    } else if (rs[6]) {
      tokens.push(sets.notWhitespace());

    } else if (rs[7]) {
      tokens.push({
        type: types.RANGE,
        from: (rs[8] || rs[9]).charCodeAt(0),
        to: rs[10].charCodeAt(0),
      });

    } else if ((c = rs[12])) {
      tokens.push({
        type: types.CHAR,
        value: c.charCodeAt(0),
      });

    } else {
      return [tokens, regexp.lastIndex];
    }
  }

  exports.error(regexpStr, 'Unterminated character class');
};


/**
 * Shortcut to throw errors.
 *
 * @param {String} regexp
 * @param {String} msg
 */
exports.error = (regexp, msg) => {
  throw new SyntaxError('Invalid regular expression: /' + regexp + '/: ' + msg);
};

},{"./sets":11,"./types":12}],14:[function(require,module,exports){
const Sentax = require('./Sentax')

class ContractionQueue {
  constructor() {
    this.queue = []
  }

  add(...sentences) {
    this.queue.push(...sentences)
  }

  next() {
    // Contract the maximum number of sentences into one, starting from the
    // front of the queue.

    if(this.queue.some(fact => fact.important)) {
      while(!this.queue[0].important && this.queue[0].isSentence) {
        console.log('skipping unimportant fact:', this.queue.shift().str())
      }
    }

    if(this.queue.length == 0)
      return null // queue is empty

    if(!this.queue[0].isSentence)
      return this.queue.shift()

    let winner = null
    let winningDepth = -1
    for(let form of this.queue[0].sentaxs().sort(() => Math.random()*2-1)) {
      let A = form
      let i
      for(i=1; i<this.queue.length && this.queue[i].isSentence; i++) {
        let success = false
        for(let B of this.queue[i].sentaxs().sort(() => Math.random()*2-1)) {
          let C = Sentax.contractPair(A, B)
          if(C) {
            A = C
            success = true
            break
          }
        }

        if(!success)
          break
      }

      let depth = i-1
      if(depth > winningDepth) {
        winningDepth = depth
        winner = A
      }
    }

    this.queue = this.queue.slice(winningDepth+1)
    return winner
  }
}
module.exports = ContractionQueue

},{"./Sentax":27}],15:[function(require,module,exports){
const regOps = require('./util/regOps')
const PredicateSet = require('./PredicateSet')
const Sentence = require('./Sentence')
const NounPhraseSentence = require('./NounPhraseSentence')
const {getTenseType} = require('./util/conjugate/verbPhrase')
const DescriptionContext = require("./DescriptionContext")
const search = require('./search')

class Declarer {
  constructor(dictionary) {
    this.entities = [] // an iterator of Entity objects
    this.ctx = new DescriptionContext()
    this.dictionary = dictionary
  }

  findOrSpawn(nounPhraseStr) {
    let entity = this.findFirst(nounPhraseStr)
    if(!entity)
      entity = this.dictionary.spawnSingle(nounPhraseStr, this.entities)

    return entity
  }

  findFirst(matchStr) {
    for(let entity of this.find(matchStr))
      return entity
  }

  *find(matchStr, searchLimit=1000) {
    let ctxMatch = this.ctx.parse(matchStr)
    if(ctxMatch)
      return ctxMatch

    for(let match of search(matchStr, this.entities))
      yield match
    for(let match of search(matchStr, search.explore(this.entities)))
      yield match
  }

  parseNounPhrase(str) {
    // first check for a simple solution
    let simple = this.findOrSpawn(str)
    if(simple)
      return simple

    // otherwise parse it as a noun phrase using the predicates
    let interpretations = this.predicates.parseNounPhrase(str)

    // filter interpretations by tense
    interpretations = interpretations.filter(I => I.tense == 'simple_present')

    // try to find sub-nounPhrases for each possibility until a solution is found
    for(let {args, predicate, paramIndex, tense} of interpretations) {
      let solutionArgs = []
      for(let i in args) {
        if(predicate.params[i].literal)
          // pass literal args straight through
          solutionArgs[i] = args[i]
        else
          solutionArgs[i] = this.parseNounPhrase(args[i])
      }

      if(!solutionArgs.includes(null)) {
        return new NounPhraseSentence(paramIndex, predicate, solutionArgs)
      }
    }


    return null
  }

  declareNounPhrase(strOrSolution) {
    // if passed a string, parse it first
    let solution
    if(strOrSolution.constructor == String)
      solution = this.parseNounPhrase(strOrSolution)
    else
      solution = strOrSolution


    // return null is failed to parse string or if passed null
    if(!solution)
      return null

    if(solution.isNounPhraseSentence) {
      let recursiveArgs = solution.recursiveEntityArgs
      for(let arg of recursiveArgs)
        this.addEntity(arg)

      solution.start()

      return solution.mainArgument
    } else {
      if(solution.isEntity)
        this.addEntity(solution)
      return solution
    }

    return null
  }

  addEntity(entity) {
    // add a Entity to the entities
    if(!entity.isEntity)
      console.warn('adding a entity which is not a entity')

    if(entity.isEntity && !this.entities.includes(entity)) {
      this.entities.push(entity)
      for(let fact of entity.facts)
        for(let e of fact.entityArgs)
          this.addEntity(e)
    }

    this.autoExpandDomain()
  }

  addEntities(...entities) {
    for(let entity of entities)
      this.addEntity(entity)
  }

  autoExpandDomain() {
    this.entities = [...search.explore(this.entities)]
  }

  parse(declarationStr, tenses, forbidSpawn=false) {
    let interpretations = this.predicates.parse(declarationStr, tenses)

    for(let {args, predicate, tense} of interpretations) {
      for(let i in args) {
        let arg = args[i]
        if(!predicate.params[i].literal) {
          if(forbidSpawn)
            args[i] = this.findFirst(arg)
          else
            args[i] = this.parseNounPhrase(arg)
        }
      }

      if(args.includes(null) || args.includes(undefined))
        continue
      else {
        let sentence = new Sentence(predicate, args)//{args, predicate, tense}
        sentence.source = 'parsed'
        sentence.parsed_tense = tense
        return sentence
      }
    }

    // if we get here, we have failed
    return null
  }

  parseImperative(declarationStr, subject, forbidSpawn=false) {
    let interpretations = this.predicates.parseImperative(declarationStr, subject)

    for(let {args, predicate, tense} of interpretations) {
      for(let i in args) {
        let arg = args[i]
        if(!predicate.params[i].literal) {
          if(forbidSpawn)
            args[i] = this.findFirst(arg)
          else
            args[i] = this.parseNounPhrase(arg)
        }
      }

      if(args.includes(null) || args.includes(undefined))
        continue
      else {
        let sentence = new Sentence(predicate, args)//{args, predicate, tense}
        sentence.source = 'parsed'
        sentence.parsed_tense = tense
        return sentence
      }
    }

    // if we get here, we have failed
    return null
  }

  declare(...declarationStrings) {
    for(let str of declarationStrings) {
      this.declareSingle(str)
    }

    return this
  }

  declareSingle(str) {
    // first check for modifiers
    let modifiedSentence = this.dictionary.modifiers.parse(str)
    if(modifiedSentence) {
      modifiedSentence.modifier.declarer = this
      modifiedSentence.modifier.exec(
        modifiedSentence.args,
        modifiedSentence.remainder,
        str => this.declare(str)
      )
      return
    }


    let sentence = this.parse(str)

    if(sentence) {
      let tenseType = getTenseType(sentence.parsed_tense)

      if(tenseType == 'present') {
        let entitiesToAdd = sentence.recursiveEntityArgs
        for(let entity of entitiesToAdd)
          this.addEntity(entity)

        sentence.start()
        if(sentence.truthValue == 'failed')
          console.warn('Declaration failed:', str)

      } else if(tenseType == 'past') {
        let entitiesToAdd = sentence.recursiveEntityArgs
        for(let entity of entitiesToAdd)
          this.addEntity(entity)

        sentence.start()
        sentence.stop()
      } else {
        console.warn('declaration with strange tense:', sentence.parsed_tense)
      }

      this.autoExpandDomain()

      return
    }

    let imperative = this.parseImperative(str)
    if(imperative) {
      console.log('imperative', imperative.str())
      this.addEntities(...imperative.entityArgs)
      imperative.start()
      return
    }

    let spawned = this.dictionary.spawnSingle(str, this.entities)
    if(spawned) {
      this.addEntity(spawned)
      return spawned;
    }

    // otherwise
    spawned = this.dictionary.spawn(str)
    for(let e of spawned)
      this.addEntity(e)

  }

  check(str) {
    let sentence = this.parse(str, undefined, true)

    if(!sentence) {
      //console.warn("CHECK FAILED, couldn't parse:", str)
      return false
    }

    let tenseType = getTenseType(sentence.parsed_tense)

    if(tenseType == 'present')
      return sentence.trueInPresent()
    else if(tenseType == 'past')
      return sentence.trueInPast()
    else
      return undefined

  }

  printEntityList() {
    return this.entities.map(entity => entity.ref())
  }
  randomEntity() {
    return this.entities[Math.floor(Math.random()*this.entities.length)]
  }
  randomFact() {
    return this.randomEntity().randomFact()
  }
  randomSentence() {
    return this.randomEntity().randomSentence()
  }
  randomPredicate() {
    return this.predicates.random()
  }

  get predicates() {
    return this.dictionary.predicates
  }
}
module.exports = Declarer

},{"./DescriptionContext":16,"./NounPhraseSentence":23,"./PredicateSet":25,"./Sentence":28,"./search":56,"./util/conjugate/verbPhrase":63,"./util/regOps":71}],16:[function(require,module,exports){
const ordinal = require('integer-to-ordinal-english')

/**
 * A class used to keep track of context specific terms and mention-histories
 * @class DescriptionContext
 * @constructor
 */

class DescriptionContext {
  constructor() {
    /**
     * list of recent noun-phrase references to objects.
     * @property {Array} referenceHistory
     */
    this.referenceHistory = []
    // Eg/ {entity: [Entity], str:'a cat'}

    /**
     * @property {Entity or null} me
     * @default `null`
     */
    this.me = null // who is the first person

    /**
     * @property {Entity or null} you
     * @default `null`
     */
    this.you = null // who is the second person
  }

  duplicate() {
    let newCtx = new DescriptionContext()
    newCtx.referenceHistory = this.referenceHistory.slice()
    newCtx.me = this.me
    newCtx.you = this.you
    newCtx.it = this.it
    newCtx.her = this.her
    newCtx.him = this.him
    newCtx.them = this.them
    newCtx.us = this.us
    return newCtx
  }

  /**
   * log a reference to the history
   * @method log
   * @param {Entity} entity
   * @param {String} str
   */
  log(entity, str) {
    this.referenceHistory.push({entity: entity, ref:str})

    if(entity.is_a('person')) {
      if(entity.pronoun == 'her')
        this.her = (this.her && this.her != entity ? undefined : entity)
      else if (entity.pronoun == 'them')
        this.them = this.them && this.them != entity ? undefined : entity
      else if (entity.pronoun == 'him')
        this.him = (this.him && this.him != entity ? undefined : entity)
    }/* else
      this.it = this.it ? undefined : entity*/
  }

  /**
   * get the pronoun of a given entity with respect to this context
   * @method getPronounFor
   * @param {Entity} entity
   * @return {String} "it", "me", "you", "her", "them" or "him"
   */
  getPronounFor(entity) {
    if(entity == this.it)
      return 'it'
    if(entity == this.me)
      return 'me'
    if(entity == this.you)
      return 'you'
    if(entity == this.her)
      return 'her'
    if(entity == this.them)
      return 'them'
    if(entity == this.him)
      return 'him'
  }

  /**
   * @method parse
   * @param {String} str
   * @return {Entity}
   */
  parse(str) {
    switch(str) {
      case 'me': return this.me;
      case 'you': return this.you;
      case 'it': return this.it;
      case 'him': return this.him;
      case 'he': return this.him;
      case 'her': return this.her;
      case 'she': return this.her;
      case 'them': return this.them;
      case 'they': return this.them;
    }
  }

  latestMentionOf(entity) {
    for(let i=this.referenceHistory.length-1; i>=0; i--)
      if(this.referenceHistory[i].entity == entity)
        return this.referenceHistory[i].ref

    return null
  }

  lastNounPhraseletMatch(phraselet) {
    for(let i=this.referenceHistory.length-1; i>=0; i--) {
      let e = this.referenceHistory[i].entity
      if(e.matchesPhraselet(phraselet))
        return e
    }

    return null
  }

  nounPhraseletMatchIndex(e, phraselet) {
    let alreadyseen = []
    for(let {entity} of this.referenceHistory) {
      if(alreadyseen.includes(entity))
        continue
      if(entity.matchesPhraselet(phraselet)) {
        if(entity == e)
          return alreadyseen.length
        else
          alreadyseen.push(entity)
      }
    }

    return -1
  }

  nounPhraseletMatches(phraselet) {
    let list = []
    for(let {entity} of this.referenceHistory) {
      if(list.includes(entity))
        continue
      else if(entity.matchesPhraselet(phraselet))
        list.push(entity)
    }

    return list
  }

  getOrdinalAdjectives(entity, phraselet) {
    let matches = this.nounPhraseletMatches(phraselet)
    let n = matches.indexOf(entity)
    if(n != -1 && matches.length > 1) {
      return [ordinal(n+1).toLowerCase()]
    } else
      return null
  }

  getArticles(entity, phraselet) {
    // if the entity has been mentioned before, use 'the'
    if(this.latestMentionOf(entity)) {
      /*if(this.lastNounPhraseletMatch(phraselet) == entity)
        return ['this']
      else*/
      return ['the']
    } else {
      if(this.lastNounPhraseletMatch(phraselet))
        return ['another']
      else
        return ['a']
    }
  }


}
module.exports = DescriptionContext

},{"integer-to-ordinal-english":7}],17:[function(require,module,exports){
const PredicateSet = require('./PredicateSet')

const DescriptionContext = require('./DescriptionContext')
const declare = require('./declare')

const Declarer = require('./Declarer')
const spawn = require('./spawn2')
const spawnSingle = require('./spawn')
const Entity = require('./Entity')
const Noun = require('./Noun')
const Sentence = require('./Sentence')
const EntitySpawner = require('./EntitySpawner')
const search = require('./search')
const SentenceModifierSet = require('./SentenceModifierSet')

/**
 * @class Dictionary
 */

class Dictionary {
  constructor({adjectives, nouns, predicates, modifiers} = {}) {
    this.adjectives = {} // {String:Function, String:Function, ...}
    this.nouns = {} //{String:Function, String:Function, ...}
    this.phrasalNouns = [] // [String, String, ...]
    this.predicates = new PredicateSet
    this.actionPredicates = new PredicateSet
    this.entitySpawners = []
    this.modifiers = new SentenceModifierSet
    this.specialSentenceSyntaxs = []

    if(adjectives)
      this.addAdjectives(adjectives)
    if(nouns)
      this.addNouns(...nouns)
    if(predicates)
      this.addPredicates(...predicates)
    if(modifiers)
      this.addModifiers(...modifiers)

    this.checkOwnership // (owner, possession) => {...}
    this.declareOwnership // (owner, possession) => {...}
    this.getOwners // possesion => [...owners]
  }

  /* Add an adjective to the dictionary */
  addAdjective(adj, extendFunction) {
    this.adjectives[adj] = extendFunction
    return this
  }

  /* Add adjectives to the dictionary. */
  addAdjectives(adjectives) {
    for(let adj in adjectives)
      this.addAdjective(adj, adjectives[adj])
  }

  /* Add a noun to the dictionary. */
  addNoun(noun) {
    if(noun.dictionary)
      throw 'Dictionary conflict over noun: ' + noun.noun

    if(!noun.isNoun)
      noun = new Noun(noun)

    noun.dictionary = this

    this.nouns[noun.noun] = noun

    if(noun.isPhrasal)
      this.phrasalNouns.push(noun)

    if(noun.spawners)
      for(let spawner of noun.spawners)
        this.addEntitySpawner(spawner)

    return this
  }

  /* Add nouns to the dictionary */
  addNouns(...nouns) {
    for(let noun of nouns)
      this.addNoun(noun)
    return this
  }

  /* Add predicates to the dictionary */
  addPredicates(...predicates) {
    this.predicates.addPredicates(...predicates)
    this.actionPredicates.addPredicates(
      ...predicates.filter(P => P.actionable)
    )
    for(let p of predicates)
      p.dictionary = this
    return this
  }

  addEntitySpawner(spawner) {
    if(spawner.dictionary)
      throw 'Dictionary conflict over entity spawner: '+spawner.template
    if(!spawner.isEntitySpawner)
      spawner = new EntitySpawner(spawner)
    this.entitySpawners.push(spawner)
    spawner.dictionary = this

    return this // chainable
  }

  addEntitySpawners(...spawners) {
    for(let spawner of spawners)
      this.addEntitySpawner(spawner)
    return this
  }

  addModifiers(...modifiers) {
    for(let modifier of modifiers) {
      this.modifiers.addModifier(modifier)
      modifier.dictionary = this
    }
    return this
  }

  addSpecialSentenceSyntax(sss) {
    this.specialSentenceSyntaxs.push(sss)
    sss.dictionary = this
    return this
  }
  addSpecialSentenceSyntaxs(...ssss) {
    for(let sss of ssss)
      this.addSpecialSentenceSyntax(sss)
    return this
  }

  declare(ctx, ...strings) {
    if(ctx.constructor == String) {
      strings.unshift(ctx)
      ctx = new DescriptionContext
    }

    return declare(this, ctx, ...strings)
  }

  quickDeclare(...strings) {
    let dec = new Declarer(this)

    dec.declare(...strings)

    return dec.entities
  }

  createEntity() {
    return new Entity(this)
  }

  spawn(...strings) {
    return spawn(this, ...strings)
  }

  spawnSingle(str, domain) { // domain is an Entity or an iterable of Entities
    return spawnSingle(this, str, domain)
  }

  findOrSpawn(matchStr, domain) {
    let result = null
    if(domain)
      result = search.first(matchStr, domain)
    if(result)
      return result
    else
      return this.spawnSingle(matchStr, domain)
  }

  S(predicate, ...args) {
    if(predicate.constructor == String)
      predicate = this.predicates.byName[predicate]

    let sentence = new Sentence(predicate, args)
    sentence = sentence.trueInPresent() || sentence
    return sentence
  }

  interpretSloppyList(stuff) {
    let list = []
    for(let bit of stuff) {
      if(bit.isEntity)
        list.push(bit)
      else if(bit.constructor == String) {
        let spawned = this.spawn(bit)
        if(spawned.length)
          list.push(...spawned)
        else {
          spawned = this.spawnSingle(bit)
          if(spawned)
            this.push(spawned)
        }
      }
    }
    return list
  }

  get nonLiteralPredicates() {
    return this.predicates.nonLiteral
  }
}
module.exports = Dictionary

},{"./Declarer":15,"./DescriptionContext":16,"./Entity":18,"./EntitySpawner":19,"./Noun":22,"./PredicateSet":25,"./Sentence":28,"./SentenceModifierSet":30,"./declare":36,"./search":56,"./spawn":57,"./spawn2":58}],18:[function(require,module,exports){
// Entity is the base class of all entities in EntityGame.
const regOps = require('./util/regOps.js')
const RandExp = require('randexp')
const spellcheck = require('./util/spellcheck')
const unSentencify = require('./util/unSentencify')
//const {beA, be} = require('./predicates')
const Sentence = require('./Sentence')

const parse = require('./parse')

const entityStr = require('./entityStr')
const {toRegexs} = require('./util/specarr')
const {explore} = require('./search')

//const consistsOfTree = require('./nouns/consistsOfTree')

const EventEmitter = require('events')
EventEmitter.defaultMaxListeners = 1000

// MORE REQUIRES AT BOTTOM

/**
 * Entity represents an object in the world. It is half derived from the word
 * 'noun', half from the word 'entityenon'. Though it fits the definition of
 * neither precisely.
 * @class Entity
 * @extends EventEmitter
 * @constructor
 */

 /**
  * @event fact
  * @param {Sentence} sentence The new fact.
  */



class Entity extends EventEmitter {
  constructor(dictionary=null) {
    super()

    /**
     * @property {Dictionary} dictionary
     */
    this.dictionary = dictionary

    /**
     * A list of noun-strings which describe the entity.
     * @property {Array} nouns
     */
    this.nouns = []

    /**
     * A list of adjective strings which describe the entity.
     * @property {Array} adjectives
     */
    this.adjectives = []

    /**
     * A special array (see src/util/specarr.js) detailing proper nouns that
     * can be used to describe the Entity.
     * @property {SpecialArray} properNouns
     */
    this.properNouns = []

    /**
     * A list of sentences which are true in the present tense and have the entity
     * as one of their arguments.
     * @property {Array} facts
     */
    this.facts = []

    /**
     * A list of sentences which are true in the past tense and have the entity as
     * one of their arguments.
     * @property {Array} history
     */
    this.history = []

    /**
     * An object describing the preposition clauses which the entity can be
     * described with. The values of the object are SpecialArrays, indexed by
     * the preposition.
     * @property {Object} prepositionClauses
     */
    this.prepositionClauses = {}
    // ^(each key is a preposition, each value a specarr)

    // SOUND:
    /*
     * A list of Sound objects which have the entity as an origin
     * @property {Array} nowPlayingSounds
     */
    //this.nowPlayingSounds = []
    /*
     * @property {SoundPlayer} soundPlayer
     */
    //this.soundPlayer = null
  }

  /**
   * Attach an adjective to the entity.
   * @method be
   * @param {String} adjective The adjective to attach
   * @param {Dictionary} [dictionary = this.dictionary]
   * @chainable
   * @throws {String} In the case that the adjective is not in the dictionary.
   */
  be(adjective, dictionary=this.dictionary) {
    if(!dictionary)
      throw 'Entity .be() needs a Dictionary'
    // load an adjective extension
    if(this.is(adjective))
      return this

    if(dictionary.adjectives[adjective]) {

      dictionary.adjectives[adjective](this)
      if(!this.adjectives.includes(adjective))
        this.adjectives.push(adjective)

      return this
    } else
      throw 'no such adjective: ' + adjective
  }

  /**
   * Check whether a given adjective is attached to the entity
   * @method is
   * @param {String} adjective
   * @return {Boolean}
   */
  is(adjective) {
    return this.adjectives.includes(adjective)
  }

  /**
   * Remove a given adjective from the entity.
   * @method stopBeing
   * @param {String} adj
   */
  stopBeing(adj) {
    this.adjectives = this.adjectives.filter(a => a != adj)
    let sentence = Sentence.S(be, this, adj)
    for(let fact of this.facts) {
      if(Sentence.compare(sentence, fact))
        fact.stop()
    }
  }

  /**
   * Inherit properties from a given noun. This enables a non-hierachical
   * inheritance structure for entities. The dictionary of nouns is defined in
   * `src/nouns/index.js`.
   * @method be_a
   * @param {String} classname The noun to inherit properties from
   * @param {Dictionary} [dictionary = this.dictionary]
   * @chainable
   * @throws {String} In the case that the noun-string is not in the dictionary.
   */
  be_a(classname, dictionary=this.dictionary) {
    // load a noun extension
    if(!dictionary)
      throw '.be_a() needs a Dictionary'

    // don't load the same extension twice
    if(this.is_a(classname))
      return this

    let noun = dictionary.nouns[classname]
    if(noun) {
      // strings can be used as aliases to other classes
      while(noun.alias) {
        classname = dictionary.nouns[noun.alias]
        noun = dictionary.nouns[classname]
      }

      if(noun.extend)
        noun.extend(this)

      if(!this.nouns.includes(classname))
        this.nouns.push(classname)

      /**
       * Emitted whenever the entity becomes a new noun.
       * @event becomeNoun
       * @param {Noun} classname
       */
      this.emit('becomeNoun', noun)

      return this
    } else
      throw 'no such entityclass: ' + classname
  }

  /**
   * Check whether the entity inherits from a given noun.
   * @method is_a
   * @param {String} classname The noun to check.
   * @return {Boolean}
   */
  is_a(classname) {
    return this.nouns.includes(classname)
  }

  /**
   * Compiles a regex for all possible noun-phrase strings for the entity.
   * @method reg
   * @param {Number} [depth=1]
   *  Limits the recursive depth for preposition phrases / embedded noun-phrases
   * @return {RegExp}
   */
  reg(depth=1) {
    let nounPhraseRegex = regOps.concatSpaced(
      /a|an|the/,
      this.nounPhraseletRegex(depth),
    )

    return regOps.or(
      nounPhraseRegex,
      ...toRegexs(this, this.properNouns, depth),
    )
  }

  nounPhraseletRegex(depth=1) {
    // Compile a regex for all possible noun-phraselet strings for this entity.
    // A noun-phraselet is a noun-phrase without an article, or context
    // specific adjectives.

    let reg = regOps.or(...this.nouns)

    let adjRegex = this.adjRegex()
    if(adjRegex){
      adjRegex = regOps.kleeneJoin(adjRegex, ',? ')
      reg = regOps.concat(
        regOps.optional(
          regOps.concat(adjRegex, ' ')
        ),
        reg
      )
    }


    depth--;
    if(depth > 0) {
      let clauseRegex = this.clauseRegex(depth)
      if(clauseRegex)
        reg = regOps.optionalConcatSpaced(
          reg, clauseRegex
        )
    }

    return reg
  }

  /**
   * @method clauseRegex
   * @param {Number} depth Limits the recursive depth for embedded noun-phrases
   * @return {RegExp}
   *  A regular expression for any preposition phrase that can be included in
   *  a noun phrase for the entity. Or `null` if there are no prepositions
   *  clauses.
   */
  clauseRegex(depth) {
    let all = []
    for(let prep in this.prepositionClauses) {
      let clauses = this.prepositionClauses[prep]
      let regexs = toRegexs(this, clauses, depth)
      if(regexs.length)
        all.push(regOps.concatSpaced(prep, regOps.or(...regexs)))
    }

    if(all.length)
      return regOps.or(...all)
    else
      return null
  }

  /**
   * Compile a regular expression for any adjective that can be used to
   * describe this entity.
   * @method adjRegex
   * @return {RegExp or Null}
   */
  adjRegex() {
    let regexs = toRegexs(this, this.adjectives)
    if(regexs.length)
      return regOps.or(...regexs)
    else
      return null
  }

  /**
   * Test whether this entity matches a given noun-phrase string.
   * @method matches
   * @param {String} str
   * @return {Boolean}
   */
  matches(str) {
    // test this entity's regex against a string
    return regOps.whole(this.reg(2)).test(str)
  }

  matchesPhraselet(str) {
    // test this entity's noun phraselet regex againt a string
    return regOps.whole(this.nounPhraseletRegex(2)).test(str)
  }

  /**
   * Randomly generate a noun-phrase that describes this entity
   * @method ref
   * @deprecated use .str() instead
   * @param ctx {DescriptionContext}
   * @param {Object} options
   * @return {String}
   */
  ref(ctx, options) {
    // come up with a random noun phrase to represent this entity
    return entityStr(this, ctx, options)
  }

  /**
   * Randomly generate a noun-phrase that describes this entity
   * @method str
   * @param ctx {DescriptionContext}
   * @param {Object} options
   * @return {String}
   */
  str(ctx, options) {
    return entityStr(this, ctx, options)
  }

  addNoun(noun) {
    if(!this.nouns.includes(noun))
      this.nouns.push(noun)
  }

  removeNoun(noun) {
    let i = this.nouns.indexOf(noun)
    if(i != -1)
      this.nouns.splice(i, 1)
    else
      console.warn(
        'tried to remove noun,', noun, ', that was not added to ', this.str()
      )
  }

  addProperNoun(str) {
    if(!this.properNouns.includes(str))
      this.properNouns.push(str)
  }

  addAdjective(adjective) {
    if(!this.adjectives.includes(adjective))
      this.adjectives.push(adjective)
  }

  removeAdjective(adjective) {
    let i = this.adjectives.indexOf(adjective)
    if(i != -1)
      this.adjectives.splice(i, 1)
    else
      console.warn(
        'tried to remove adjective,', adjective, ', that was not added to ',
        this.str()
      )
  }

  /**
   * Attaches a preposition clause to the entity
   * @method addClause
   * @param {String} prep The preposition
   * @param clause The clause following the preposition.
   */
  addClause(prep, clause) {
    // add a preposition clause to this Entity
    // the clause may be any unexpanded cell of a specarr
    if(!this.prepositionClauses[prep])
      this.prepositionClauses[prep] = [clause]
    else
      this.prepositionClauses[prep].push(clause)
  }

  /**
   * Remove a given preposition clause from the entity
   * @method removeClause
   * @param {String} prep The preposition
   * @param {String, Substitution, Function or Entity} clause
      The clause following the preposition
   */
  removeClause(prep, clause) {
    // remove a given preposition clause from this Entity
    let list = this.prepositionClauses[prep]
    if(list)
      this.prepositionClauses[prep] = list.filter(cl => cl != clause)
  }

  /**
   * Choose a random sentence which is presently true has this entity as an
   * argument.
   * @method randomFact
   * @return {Sentence}
   */
  randomFact() {
    return this.facts[Math.floor(Math.random() * this.facts.length)]
  }

  /**
   * Choose a random sentence which is true in the past-tense and has this entity
   * as an argument.
   * @method randomHistoricFact
   * @return {Sentence}
   */
  randomHistoricFact() {
    return this.history[Math.floor(Math.random() * this.history.length)]
  }

  /**
   * Choose a random sentence, true in the past or present tense, and has this
   * entity as an argument.
   * @method randomSentence
   * @return {Sentence}
   */
  randomSentence() {
    if(Math.random() * (this.facts.length + this.history.length) < this.facts.length)
      return this.randomFact()
    else
      return this.randomHistoricFact()
  }

  // Handy
  do(str, ctx) {
    let instructions = unSentencify(str)
    for(let instruction of instructions) {
      let parsed = parse.imperative(this, instruction, this.dictionary, ctx)
      if(parsed && parsed.imperative) {
        parsed.start(this)
      } else
        console.warn('Unhandled ('+this.str()+').do():', instruction)
    }
  }

  findNearest(str, ctx) {
    let parsed = parse.nounPhrase(str, this.dictionary, ctx)
    if(parsed) {
      for(let e of explore([this]))
        if(parsed.matches(e))
          return e

      // Otherwise
      return null
    } else
      console.warn('('+this.str()+').findNearest('+str+') failed to parse.')
  }
}
Entity.prototype.isEntity = true
module.exports = Entity


const spawn = require('./spawn2')

},{"./Sentence":28,"./entityStr":37,"./parse":45,"./search":56,"./spawn2":58,"./util/regOps.js":71,"./util/specarr":73,"./util/spellcheck":74,"./util/unSentencify":77,"events":362,"randexp":8}],19:[function(require,module,exports){
const Substitution = require('./util/Substitution')
const getNounPhraselet = require('./util/getNounPhraselet')
const regops = require('./util/regops')
const search = require('./search')
const parseList = require('./util/politeList').parse

const placeholderRegex = /(?:@|#|L)?_/g
/*
  /(?:@|#|L)_/
  @: literal
  #: number
  L: list
*/

/**
 * @class EntitySpawner
 * @constructor
 * @param options
 * @param {String} options.template
 *  The template string describing the syntax of the entity spawner.
 * @param {Function} construct
 *  A function which takes a list of arguments (parsed from a string) and
 *  returns an entity.
 * @param {} format
 *  The inverse of construct, takes an entity and returns an array of arguments.
 */
class EntitySpawner {
  constructor({template, construct, format, phraseletMode=true}) {
    this.phraseletMode = phraseletMode

    this.template = template
    this.unboundRegex = new RegExp(
      this.template.replace(placeholderRegex, '(.+)')
    )
    this.regex = regops.whole(this.unboundRegex)

    let placeholders = this.template.match(placeholderRegex)
    if(placeholders)
      this.params = placeholders.map(ph => ({
        entity: ph[0] == '_',
        number: ph[0] == '#',
        literal: ph[0] == '@',
        list: ph[0] == 'L',
      }))
    else
      this.params = []

    this._construct = construct
  }

  parse(str, domain) {
    if(this.phraseletMode)
      str = getNounPhraselet(str).phraselet

    let result = this.regex.exec(str)
    if(result) {
      let args = result.slice(1)
      for(let i in args) {
        if(this.params[i].literal)
          continue
        if(this.params[i].number) {
          args[i] = parseFloat(args[i])
          if(isNaN(args[i]))
            return null
        }
      }

      // parse entities last to reduce the risk of dropping a spawned entity
      for(let i in args)
        if(this.params[i].entity) {
          args[i] = this.dictionary.findOrSpawn(args[i], domain)
          if(!args[i])
            return null
        } else if(this.params[i].list) {
          let list = parseList(args[i])
          if(list)
            for(let j in list) {
              list[j] = this.dictionary.findOrSpawn(list[j], domain)
              if(!list[j])
                return null
            }
          args[i] = list
        }
      // BUG STILL EXISTS WAITIMG!! Need to delay spawner construction

      return {
        entitySpawner: this,
        args: args,
      }
    } else
      return null
  }

  compose(...args) {
    return new Substitution(this.template, ...args)
  }

  str(args) {
    return this.compose(...args).str()
  }

  construct(...args) {
    if(this._construct)
      return this._construct(...args)
    else
      throw "EntitySpawner's ._construct() is not defined: " + this.template
  }
}
EntitySpawner.prototype.isEntitySpawner = true
module.exports = EntitySpawner

},{"./search":56,"./util/Substitution":59,"./util/getNounPhraselet":64,"./util/politeList":70,"./util/regops":72}],20:[function(require,module,exports){
const {sub} = require('./util/Substitution')
const specarr = require('./util/specarr')

function entityStr(entity, ctx, options={}) {
  // Convert a entity into a noun phrase string.

  if(typeof options == 'number')
    options = {maxDetails: options}


  // max details default logic, yuck
  if(options.maxDetails == undefined)
    options.maxDetails = 0
  if(options.maxAdjectives == undefined) {
    if(options.maxPrepositionClauses == undefined) {
      // both undefined, distribute at random
      options.maxPrepositionClauses = Math.floor(Math.random() * (options.maxDetails+1))
      options.maxAdjectives = options.maxDetails - options.maxPrepositionClauses
    } else
      // only maxAdjectives is undefined
      options.maxAdjectives = options.maxDetails-options.maxPrepositionClauses
  } else if(options.maxPrepositionClauses == undefined)
    // only maxPrepositionClauses is undefined
    options.maxPrepositionClauses = options.maxDetails-options.maxAdjectives

  delete options.maxDetails

  // destructure options and apply default values
  let {
    //maxDetails = undefined, // max number of details to give (including nested)
    maxAdjectives = undefined,  // max number of adjectives to use (inc. nested)
    maxPrepositionClauses=undefined,  // max number of preposition clauses to use (inc. nested)
    nounSpecificness=1,     // scale 0-1, how specific should the noun be
    //dontMention,          // list of entities not to mention
    //recursionDepth=3,       // limit the number of recursive entityStr calls
  } = options
  delete options.article

  // COMPOSE THE NOUN PHRASE

  // choose a noun
  let out = entity.nouns[Math.floor(nounSpecificness*(entity.nouns.length-0.5))]

  // choose and apply preposition clauses
  if(maxPrepositionClauses) {
    let nClauses = Math.floor(Math.random() * (maxPrepositionClauses+1))
    if(nClauses) {
      // prepare list of all possible clauses
      let allClauses = []
      for(let prep in entity.prepositionClauses)
        allClauses.push(...specarr.expand(entity, entity.prepositionClauses[prep]).map(
          clause => sub('_ _', prep, clause)
        ))

      // chooses clauses to use
      let clauses = []
      for(let i=0; i<nClauses && allClauses.length; i++) {
        clauses.push(
          allClauses.splice(Math.floor(Math.random() * allClauses.length), 1)
        )

        // decrement maxPrepositionClauses in options (effects recursive calls/callers)
        options.maxPrepositionClauses--
      }

      // append chosen clauses to output
      if(clauses.length)
        out = sub('_ _', out, clauses.sort(() => Math.random()*2-1))
    }
  }

  // choose and apply adjectives
  if(maxAdjectives) {
    let nAdjs = Math.floor(Math.random() * (maxAdjectives+1)) + 1
    if(nAdjs) {
      let allAdjs = specarr.expand(entity, entity.adjectives)

      // choose adjectives
      let adjs = []
      for(let i=0; allAdjs.length && i<nAdjs; i++) {
        adjs.push(allAdjs.splice(Math.floor(Math.random() * allAdjs.length), 1))
        options.maxAdjectives--
      }

      // prepend chosen adjectives to output
      if(adjs.length)
        out = sub('_ _', adjs.sort(() => Math.random()*2-1), out)
    }
  }

  if(out.isSubstitution)
    return out.str(ctx, options)
  else if(out.constructor == String)
    return out
  else
    throw 'strange output: '+str
}
module.exports = entityStr

},{"./util/Substitution":59,"./util/specarr":73}],21:[function(require,module,exports){
const EventEmitter = require('events')
const Sentence = require('./Sentence')

/**
  The FactListener class is a convenient class for handling event listeners on
  multiple Entitys at once.
  @class FactListener
  @constructor
  @extends EventEmitter
  @param {Entity} [...entities]
    A list of member entities to add to the new fact listener.
*/

class FactListener extends EventEmitter {
  constructor(...entities) {
    // call superconstructor
    super()

    // list of member entities
    this.entities = []

    // last emitted fact (used to avoid duplicates)
    this.lastFact = null

    // function to be called by entity event listeners
    this.callback = sentence => {
      // if fact is not a duplicate, emit a fact event
      if(!this.lastFact || this.lastFact != sentence)
        this.emit('fact', sentence)

      this.lastFact = sentence
    }

    // add constructor arguments to member list
    for(let entity of entities)
      this.add(entity)
  }

  /**
   * Adds a single entity member.
   * @method add
   * @param {Entity} entity The entity to be added.
   * @return {null}
   */
  add(entity) {
    // throw an error if argument is not a entity
    if(!entity.isEntity)
      throw 'FactListener add() expects a entity'
    this.entities.push(entity)
    entity.on('fact', this.callback)

  }

  /**
    * Removes a single entity member.
    * @method remove
    * @param {Entity} entity The entity to be added.
    * @return {null}
    */
  remove(entity) {
    if(this.entities.includes(entity)) {
      // remove event listener
      entity.removeListener('fact', this.callback)

      // remove entity from member list.
      let i = this.entities.indexOf(entity)
      this.entities.splice(i, 1)
    } else
      console.warn('attempt to remove entity from fact listener to which it is not a member')
  }

  /**
    * Remove all entities members
    * @method clear
    * @return {null}
    */
  clear() {
    for(let entity of this.entities)
      this.remove(entity)
  }
}
module.exports = FactListener


// PROBLEMS:
// - Eliminating duplicates.

},{"./Sentence":28,"events":362}],22:[function(require,module,exports){
const {toPlural} = require('./util/plural')

/**
 * @class Noun
 * @constructor
 * @param {Object|String} options
 * @param {String} options.noun
 * @param {String|Array} options.inherits String or array of strings.
 * @param {Function} options.extendFunction
 * @param {Array} options.constructors
 */

class Noun {
  constructor(options) {
    // handle strings
    if(options.constructor == String)
      options = {noun:options}

    let {
      noun,
      inherits=[],
      extend,
      alias,
      spawners=[],
      modusOperandi=null
    } = options

    this.noun = noun
    this.singular = this.noun
    this.plural = toPlural(this.noun)
    this.modusOperandi = modusOperandi

    this.regexTerminating = new RegExp(this.singular+'$', 'i')
    this.pluralRegexTerminating = new RegExp(this.plural+'$', 'i')

    this.regex = new RegExp(
      '^(?<pre_noun>.+) (?:(?:(?<singular>'
      + this.singular
      + '))|(?:(?<plural>'
      + this.plural
      + ')))$',
      'i'
    )

    if(inherits.constructor == String)
      this.inherits = [inherits]
    else if(inherits.constructor == Array)
      this.inherits = inherits

    if(extend)
      this.extendFunction = extend

    this.alias = alias

    this.spawners = spawners.slice()

    this.isPhrasal = / /.test(this.noun)

    // EXTRAS
    this.consistsOf = options.consistsOf
    this.contains = options.contains
    this.reverb = options.reverb
  }

  extend(entity) {
    for(let base of this.inherits)
      entity.be_a(base)

    if(this.extendFunction)
      this.extendFunction(entity)

    if(this.modusOperandi)
      entity.do(this.modusOperandi)
  }

  parse(str) {
    let info = this.regex.exec(str)
    if(info)
      return {
        noun: this,
        plural: !info.groups.singular,
        str: str,
        remainder: info.groups.pre_noun,
      }
    else
      return null
  }
}
module.exports = Noun

},{"./util/plural":69}],23:[function(require,module,exports){
/**
  A subclass of Sentence. This class is used to represent a sentence (predicate
  + arguments) in the form of a noun. For example, "the cigarette that he was
  smoking".

  A NounPhraseSentence can be used as an argument in another sentence.
  @class NounPhraseSentence
  @extends Sentence
  @constructor
  @param {Number} mainArgumentIndex
  @param {Predicate} predicate
  @param {Array} args
*/

const Sentence = require('./Sentence')

class NounPhraseSentence extends Sentence {
  constructor(mainArgumentIndex, predicate, args) {
    super(predicate, args)
    this.mainArgumentIndex = mainArgumentIndex
  }

  /**
   * @attribute mainArgument
   * @readOnly
   */
  get mainArgument() {
    return this.args[this.mainArgumentIndex]
  }
}
NounPhraseSentence.prototype.isNounPhraseSentence = true
module.exports = NounPhraseSentence

},{"./Sentence":28}],24:[function(require,module,exports){
const PredicateSyntax = require('./PredicateSyntax')

/**
  @class Predicate
  @constructor
  @param {Object} [options] Options for constructing the predicate.
  @param {String} [options.verb] The verb of the predicate.
  @param {Array}  [options.params]
  @param {Array}  [options.forms] Alternatively multiple syntaxes can be defined using an
                         array of verb/params/constants objects.
  @param {Function} [options.skipIf]
  @param {Function} [options.replace]
  @param {Function} [options.prepare]
  @param {Function} [options.problem]
  @param {Function} [options.check]
  @param {Function} [options.begin]
  @param {Function} [options.meanwhile]
  @param {Function} [options.expand]
  @param {Function} [options.until]
  @param {Function} [options.afterwards]
  @param {Boolean}  [options.banal=false]
  @param {Boolean}  [options.actionable=true] Can the predicate be used treated as an imperative instruction?
*/

class Predicate {
  constructor({
    // syntax(s) description
    verb, params=['subject'], // used if initialising with only one form
    forms=[],
    // semantic functions
    begin, expand, check, until, afterwards, prepare, skipIf, replace, problem, meanwhile,
    banal=false, actionable=true,
  }) {
    // if verb and params are given, initialise with one form
    if(verb && params)
      forms.unshift({verb: verb, params:params})

    // initialise forms as PredicateSyntax objects
    this.forms = forms.map(form => new PredicateSyntax(form))

    // check that form parameters agree
    this.params = this.forms[0].params.map(param => ({literal: param.literal}))

    for(let syntax of this.forms) {
      if(syntax.predicate)
        throw 'Predicate has form conflict.'
      syntax.predicate = this
      
      if(syntax.params.length != this.params.length)
        throw 'Predicate has incompatible forms'
      for(let i in syntax.params)
        if(syntax.params[i].literal != this.params[i].literal)
          throw 'Predicate has incompatible forms'
    }

    // sort forms by specificness
    this.forms = this.forms.sort((A, B) => B.specificness - A.specificness)
    // overall specificness is the maximum specificness of the predicates forms
    this.specificness = this.forms[this.forms.length-1].specificness

    // semantic functions:
    /**
      `skipIf` is called as when starting a sentence. If it returns a truthy
      value then the sentence will cancel starting and won't happen. Should
      generally be used to check whether an action is unnecessary because its
      outcome is already true.
      @property {Function} skipIf
    */
    this.skipIf = skipIf

    /**
     * `replace` is called when starting a sentence. If it returns a truthy
     * value then the sentence will cancel starting and won't happen. The
     * returned sentences will be started instead. Should be used to correct
     * lazy user input.
     */
    this.replace = replace

    /**
      `_prepare` is called before a sentence happens. If it returns a sentence
      or list of sentences, these sentences will be executed consequetively
      before the original sentence happens.
      @property {Function} _prepare
    */
    this._prepare = prepare

    /**
     * Problem returns truthy if the sentence is illegal.
     * @property {Function} problem
     */
    this.problem = problem

    /**
     `check` is called to decide whether it is necessary to call `_begin`.
      If it returns truthy then `_begin` will be skipped, the start process
      will not be cancelled however. Its secondary purpose is for answering
      question sentences (true/false) when they have not been specifically
      declared as sentences.
      @property {Function} check
    */
    this.check = check

    /**
      * `_begin` is called directly after the sentence happens. So far, the
      * return value is ignored.
      * @property {Function} _begin
      */
    this._begin = begin

    /**
     * `meanwhile` is called directly after a sentence happens (after `_begin`)
     * if it returns a sentence, or list of sentences, these will be started
     * using the original sentence as a cause. In other words, they will be
     * stopped as soon the original sentence finishes.
     */
    this.meanwhile = meanwhile

    /**
      * `_expand` works in a similar way to `_prepare` except it is called
      * immediately after a sentence happens. If it returns a sentence, or an
      * array of sentences, these will be executed consequetively and the main
      * sentence will be stopped after the last one finishes.
      * @property {Function} _expand
      */
    this._expand = expand

    /**
      * `until` is called immediately after a sentence happens (after
      * `_expand`). It has an additional callback arguemnt (prepended) which,
      * when called will stop the sentence.
      * @property {Function} until
      */
    this.until = until

    /**
      * `_afterwards` is immediately after the sentence stops. If it returns a
      * sentence or an array of sentences, these will be executed simultaneously
      * @property {Function} _afterwards
      */
    this._afterwards = afterwards

    /**
     * If a predicate is marked banal, sentences using it will be ignored by
     * certain processes to do with story telling.
     * @property {Boolean} banal
     * @default false
     */
     this.banal = banal

    /**
     * If a predicate is marked actionable it can be parsed as an imperative
     * instruction.
     * @property {Boolean} actionable
     * @default true
     */
     this.actionable = actionable
  }

  /**
   * Checks whether a given list of arguments are of the right type to fit the
   * parameters of a predicate.
   * @method checkArgs
   * @param {Array} args
   * @return {Boolean}
   */
  checkArgs(args) {
    if(this.params.length != args.length) {
      console.warn('wrong number of arguments!')
      return false // whoops, wrong number of arguments!
    }

    for(let i in args) {
      let arg = args[i]
      if(this.params[i].literal) {
        // parameter is flagged literal so argument should be a string
        if(arg.constructor == String)
          continue
        else {
          return false
        }

      } else if(arg.isEntity)
        // non-literal args must be a Entity or a NounPhraseSentence
        continue
      else if(arg.isNounPhraseSentence && arg.checkArgs())
        continue
    }

    // we got to the end, so the arguments are legal
    return true
  }

  /** Prase a string against a given list of tenses
      @method parse
      @param {String} str The String to parse
      @param {Array} tenses List of tenses to parse the string against
      @return {Sentence}
        A sentence with string placeholders as arguments or null (if cannot be
        parsed)
  */
  parse(str, tenses) {
    for(let form=0; form<this.forms.length; form++) {
      let syntax = this.forms[form]
      let interpretation = syntax.parse(str, tenses)
      if(interpretation) {
        interpretation.predicate = this
        interpretation.form = form
        return interpretation
      }
    }
    return null
  }

  /**
      Parses a string using the imperative tense, for a given subject
      @method parseImperative
      @param {String} str The NL string to be parsed.
      @param {Entity} subject The subject of the sentence.
      @return {Sentence}
        A sentence with string placeholders as arguments (except the subject)
        or `null` in the case that the string cannot be parsed.
  */
  parseImperative(str, subject) {
    for(let form=0; form<this.forms.length; form++) {
      let syntax = this.forms[form]
      let interpretation = syntax.parseImperative(str, subject)
      if(interpretation) {
        interpretation.predicate = this
        interpretation.form = form
        return interpretation
      }
    }
    return null
  }

  /**
   * Parses a string in noun phrase form, referring to one of the arguments.
   * For example, "The cup that is on the table".
   * @method parseNounPhrase
   * @param {String} str The string to be parsed
   * @return {Sentence} A sentence with string placeholders as arguments, or
                        `null` in the case that the string cannot be parsed.
   */
  parseNounPhrase(str) {
    for(let form=0; form<this.forms.length; form++) {
      let syntax = this.forms[form]
      let interpretation = syntax.parseNounPhrase(str)
      if(interpretation) {
        interpretation.predicate = this
        interpretation.form = form
        return interpretation
      }
    }
  }

  /**
   * Generate an english string version of the predicate for a given set of
   * arguments in a given tense.
   * @method str
   * @param {Object} details
   * @param {Array} details.args
   *  The list of arguments for the sentence.
   * @param {String} [details.tense = "simple_present"]
   *  The tense in which to compose the sentence. (see verbPhrase.js)
   * @param {Number} [details.form = 0]
   *  The index of the syntactic form to be used (for predicates with multiple
   *  forms)
   * @param {DescriptionContext} [ctx]
   *  An object describing the context for which the string is being generated.
   * @param {Object} [options]
   *  The entityStr options, dictating preferences for how entity arguments should
   *  be written.
   * @return {String} The written sentence.
   */
  str({args, tense, form}, ctx, options) {
    return this.compose({args:args, tense:tense, form:form}).str(ctx, options)
  }

  /**
   * Prepare an english version of the predicate for a given set of
   * arguments in a given tense.
   * @method compose
   * @param {Object} details
   * @param {Array} details.args
   *  The list of arguments for the sentence.
   * @param {String} [details.tense = "simple_present"]
   *  The tense in which to compose the sentence. (see verbPhrase.js)
   * @param {Number} [details.form = 0]
   *  The index of the syntactic form to be used (for predicates with multiple
   *  forms)
   * @param {Object} verbPhraseOptions
   * @return {Substitution} A substitution ready to format the sentence.
   */
  compose({args, tense, form}, verbPhraseOptions) {
    if(form == undefined)
      form = Math.floor(Math.random()*this.forms.length)
    return this.forms[form].compose(
      {args:args, tense:tense},
      verbPhraseOptions,
    )
  }

  /**
   * Generate a set of preposition clauses for a particular argument.
   * @method presentPrepositionClausesFor
   * @param {Number} argIndex
   *  The index of of the argument to generate clauses for.
   * @param {Array} args The complete list of arguments.
   * @return {Array}
   *  An array of preposition (string) clause (substitution) pairs.
   */
  presentPrepositionClausesFor(argIndex, args) {
    let list = []
    for(let syntax of this.forms)
      list.push(...syntax.presentPrepositionClausesFor(argIndex, args))

    return list
  }

  /**
   * Generate a set of preposition clauses for a particular argument in the
   * past tense.
   * @method pastPrepositionClausesFor
   * @param {Number} argIndex
   *  The index of of the argument to generate clauses for.
   * @param {Array} args The complete list of arguments.
   * @return {Array}
   *  An array of preposition (string) clause (substitution) pairs.
   */
  pastPrepositionClausesFor(argIndex, args) {
    let list = []
    for(let syntax of this.forms)
      list.push(...syntax.pastPrepositionClausesFor(argIndex, args))

    return list
  }


  /**
   * A list contiaining a camelCase names for each form of this Predicate.
   * @attribute names
   * @readOnly
   */
  get names() {
    let list = []
    for(let form of this.forms) {
      list.push(form.camelCaseName)
    }
    return list
  }

  /**
   * Returns a random PredicateSyntax form belonging to this Predicate.
   * @method randomForm
   * @returns {PredicateSyntax}
   */
  randomForm() {
    return this.forms[Math.floor(Math.random()*this.forms.length)]
  }

  get hasLiterals() {
    return this.forms.some(form => form.hasLiterals)
  }

  get subjectArgIndexs() {
    let list = []
    for(let form of this.forms) {
      let param = form.paramsByName._subject
      if(param) {
        let i = param.index
        if(!list.includes(i))
          list.push(i)
      }
    }

    if(list.length)
      return list.sort((A,B) => A-B)
    else
      return null
  }
}
Predicate.prototype.isPredicate = true
module.exports = Predicate

},{"./PredicateSyntax":26}],25:[function(require,module,exports){
const Predicate = require('./Predicate')

/**
 * A class for handling multiple predicates at once.
 * @class PredicateSet
 * @constructor
 * @param {Predicate} [...predicates] Predicates to include in the set.
 */

class PredicateSet {
  constructor(...predicates) {
    /**
     * An array of predicates which are members of the set.
     * @property predicates {Array}
     */
    this.predicates = []

    this.syntaxs = []
    /**
     * The predicates of the set indexed by camel case name.
     * @property byName {Object}
     */
    this.byName = {}

    /**
     * A list of predicates that do not have any literal parameters.
     * @property nonLiteral
     */
    this.nonLiteral = []

    this.addPredicates(...predicates)
  }

  /**
   * Adds predicates to the set.
   * @method addPredicates
   * @param {Predicate} ...predicates The predicates to be added.
   */
  addPredicates(...predicates) {
    for(let p of predicates) {
      if(p.constructor == Object)
        p = new Predicate(p)

      if(p.isPredicate) {
        this.predicates.push(p)
        for(let syntax of p.forms)
          this.syntaxs.push(syntax)
        for(let name of p.names)
          this.byName[name] = p

        if(!p.hasLiterals)
          this.nonLiteral.push(p)
      }
    }
    this.sortPredicates()
  }

  /**
   * Parse a sentence string against all the predicates in the set.
   * @method parse
   * @param {String} str The sentence string to parse
   * @param {Array} tenses
   *  An array of strings. The tenses to parse the stirng against.
   * @return {Array}
   *  An array of matches to the string as sentenses with
   *  placeholder-string arguments.
   */
  parse(str, tenses) {
    let interpretations = []
    for(let p of this.predicates) {
      let interpretation = p.parse(str, tenses)
      if(interpretation)
        interpretations.push(interpretation)
    }

    return interpretations
  }

  /**
   * Parse a string in the imperative tense for a given subject. The subject
   * will be copied to the subject argument of the resultant sentences
   * @method parseImperative
   * @param {String} str
   * @param {Entity} subject The subject, either a entity or a string.
   * @return {Array} An array sentence with placeholder-string arguments.
   */
  parseImperative(str, subject) {
    let interpretations = []
    for(let p of this.predicates) {
      let interpretation = p.parseImperative(str, subject)
      if(interpretation)
        interpretations.push(interpretation)
    }

    return interpretations
  }

  /**
   * Parse a sentence-string in noun-phrase form. Eg/ "the cup that is on the
   * table".
   * @method parseNounPhrase
   * @param {String} str
   * @return {Array} An array of sentences with string-placeholder arguments
   */
  parseNounPhrase(str) {
    let interpretations = []
    for(let p of this.predicates) {
      let interpretation = p.parseNounPhrase(str)
      if(interpretation)
      interpretations.push(interpretation)
    }

    return interpretations
  }

  /**
   * @method random
   * @return {Predicate} A random predicate from the set.
   */
  random() {
    return this.predicates[Math.floor(Math.random()*this.predicates.length)]
  }

  /**
   * Sorts predicates in descending order of 'specificness'.
   * @method sortPredicates
   */
  sortPredicates() {
    this.predicates = this.predicates.sort(
      (A, B) => B.specificness-A.specificness
    )
    this.syntaxs = this.syntaxs.sort(
      (p, q) => q.specificness-p.specificness
    )
  }
}
module.exports = PredicateSet

},{"./Predicate":24}],26:[function(require,module,exports){
/**
  A class for representing a single syntactic 'form' of a predicate.
  @class PredicateSyntax
  @constructor
  @param {Object} options
  @param {String} options.verb
  @param {Array} options.params
  @param {Array} options.constants
  @param {Array} [options.presentTenses]
  @param {Array} [options.pastTenses]
*/

const verbPhrase = require('./util/conjugate/verbPhrase')

const usefulTenses = ['simple_present', 'simple_past']//verbPhrase.tenseList
// ^ (must be in reverse order of specificness)

const Sentax = require('./Sentax')
const ParsedSentence = require('./parse/ParsedSentence')
const parseNounPhrase = require('./parse/parseNounPhrase')


class PredicateSyntax {
  constructor({
    verb, params=['subject'], constants={},
    presentTenses=['simple_present'],
    pastTenses=['simple_past'],
  }) {
    /**
     * @property {String} verb
     */
    this.verb = verb

    if(constants.subject) {
      constants._subject = constants.subject
      delete constants.subject
    }
    if(constants.object) {
      constants._object = constants.object
      delete constants.object
    }
    /**
     * @property {Array} constants
     */
    this.constants = constants

    /**
     *  The params assign the syntactic function of the arguments.
     * @property {Array} params
     */
    this.params = params.map((param, i) => {
      if(param.constructor == String) {
        let literal = false
        if(param[0] == '@') {
          literal = true
          param = param.slice(1)
        }

        if(param == 'subject')
          param = '_subject'
        if(param == 'object')
          param = '_object'

        return {
          name: param,
          literal: literal,
          index: i
        }
      }
    })

    /**
     * The param objects indexed by name.
     * @property {Object} paramsByName
     */
    this.paramsByName = {}
    for(let param of this.params)
      this.paramsByName[param.name] = param
    /**
     * @property {String} camelCaseName
     */
    // generate camel case name
    let words = [
      ...this.verb.split(/_| /)
    ]
    for(let param of this.params)
      if(param.name[0] != '_')
        words.push(...param.name.split(/_| /))

    this.camelCaseName = words.map(word => word[0].toUpperCase()+word.slice(1)).join('')


    // set-up regexs
    this.regexs = {}
    this.makeParamRegexs()
    // calculate specificness
    this.getSpecificness()

    // tenses
    this.presentTenses = presentTenses
    this.pastTenses = pastTenses
  }

  /**
   * Convert an associated arguments object (indexed by param-name) into an
   * ordered argument list
   * @method orderArgs
   * @param {Object} associativeArgs
   * @return {Array} Ordered args.
   */
  orderArgs(associativeArgs={}) {
    let orderedArgs = []
    for(let {name} of this.params)
      orderedArgs.push(associativeArgs[name])
    return orderedArgs
  }

  /**
   * Convert an ordered list of arguments into an associated arguments object
   * (indexed by param-name).
   * @method associateArgs
   * @param {Array} orderedArgs
   * @return {Object}
   */
  associateArgs(orderedArgs) {
    let associativeArgs = {}
    for(let i in this.params)
      associativeArgs[this.params[i].name] = orderedArgs[i]
    return associativeArgs
  }

  /**
   * @method makeRegex
   * @param {String} tense
   * @param {Object} options Options for verbPhrase
   */
  makeRegex(tense, options) {
    if(!this.capturingAction){
      let action = {_verb: this.verb}
      for(let {name} of this.params) {
        action[name] = '(?<'+name+'>.+)'
      }
      for(let name in this.constants) {
        action[name] = this.constants[name]
      }
      this.capturingAction = action
    }

    let vp = verbPhrase(this.capturingAction, tense, options)

    return new RegExp('^'+vp.str()+'$', 'i')
  }

  regex(tense) {
    if(!this.regexs[tense])
      this.regexs[tense] = this.makeRegex(tense)

    return this.regexs[tense]
  }

  /**
   * @method makeParamRegexs
   */
  makeParamRegexs() {
    for(let param of this.params) {
      let {name, literal} = param
      if(literal)
        continue
      param.regexs = {}
      for(let tense of usefulTenses) {
        let reg = this.makeRegex(tense, {nounPhraseFor:name})
        param.regexs[tense] = reg
      }
    }
  }

  /**
   * @method parse
   * @param {String} str
   * @param {Array} [tenses]
   * @return {Object}
   */
  parse(str, tenses=[...this.presentTenses, ...this.pastTenses]) {
    for(let tense of tenses) {
      if(!this.regexs[tense])
        this.regexs[tense] = this.makeRegex(tense)
      let reg = this.regexs[tense]
      let result = reg.exec(str)
      if(result)
        return {
          tense: tense,
          args: this.orderArgs(result.groups),
          predicate: this,
        }
    }

    return null
  }

  parseSentence(str, ctx) {
    let tenses=[...this.presentTenses, ...this.pastTenses]
    for(let tense of tenses) {
      if(!this.regexs[tense])
        this.regexs[tense] = this.makeRegex(tense)
      let reg = this.regexs[tense]
      let result = reg.exec(str)
      if(result) {
        let args = this.orderArgs(result.groups)
        let failed = false
        for(let i in args)
          if(this.params[i].literal)
            continue

          else if(this.params[i].number) {
            args[i] = parseFloat(args[i])
            if(isNaN(args[i])) {
              failed = true
              break
            }
          } else {
            args[i] = parseNounPhrase(args[i], this.dictionary, ctx)
            if(!args[i]) {
              failed = true
              break
            }
          }

        if(!failed)
          return new ParsedSentence({
            tense: tense,
            args: args,
            predicate: this.predicate,
            syntax: this,
          }, this.dictionary, ctx)
      }
    }

    return null
  }

  parseImperativeSentence(str, subject, ctx) {
    let reg = this.regex('imperative')
    let result = reg.exec(str)
    if(result) {
      if(!result.groups)
        result.groups = {}
      result.groups._subject = subject
      let args = this.orderArgs(result.groups)

      for(let i in args)
        if(this.params[i].name == '_subject')
          continue

        else if(this.params[i].literal)
          continue

        else if(this.params[i].number) {
          args[i] = parseFloat(args[i])
          if(isNaN(args[i]))
            return null
        }

        else {
          args[i] = parseNounPhrase(args[i], this.dictionary, ctx)
          if(!args[i])
            return null
        }

      // Otherwise,
      return new ParsedSentence({
        tense: 'imperative',
        args: args,
        syntax: this,
        predicate: this.predicate,
      }, this.dictionary, ctx)
    }

    return null
  }

  parseEmbeddedSentence(str, ctx) {
    for(let param of this.params) {
      for(let tense in param.regexs) {
        let reg = param.regexs[tense]
        let result = reg.exec(str)
        if(result) {
          let args = this.parseArgs(this.orderArgs(result.groups), ctx)
          if(args) {
            let sentence = new ParsedSentence({
              tense: tense,
              args: args,
              predicate:this.predicate,
              syntax:this,
            }, this.dictionary, ctx)
            let mainArgument = args[param.index]
            mainArgument.facts.push({
              fact: sentence,
              argIndex: param.index
            })
            return mainArgument
          }
        }
      }
    }
  }

  parseArgs(args, ctx) {
    args = args.slice()
    for(let i in args)
      if(this.params[i].literal) {
        if(args[i].constructor == String)
          continue
        else
          return null
      }

      else if(this.params[i].number) {
        args[i] = parseFloat(args[i])
        if(isNaN(args[i]))
          return null
      }

      else {
        args[i] = parseNounPhrase(args[i], this.dictionary, ctx)
        if(!args[i])
          return null
      }

    return args
  }

  /**
   * @method parseImperative
   * @param {String} str
   * @param {Entity} subject
   * @return {Object}
   */
  parseImperative(str, subject) {
    // Parse an imperative string for a given subject

    // call parse using imperative tense
    let parsed = this.parse(str, ['imperative'])

    // set the subject argument to the given subject
    if(parsed && this.paramsByName._subject)
      parsed.args[this.paramsByName._subject.index] = subject

    return parsed
  }

  /**
   * @method parseNounPhrase
   * @param {String} str
   * @return {Object}
   */
  parseNounPhrase(str) {
    for(let param of this.params) {
      for(let tense in param.regexs) {
        let reg = param.regexs[tense]
        let result = reg.exec(str)
        if(result)
          return {
            tense: tense,
            param: param.name,
            paramIndex: param.index,
            predicate: this,
            args: this.orderArgs(result.groups)
          }
      }
    }
  }


  /**
   * @method str
   * @param {Object} details
   * @param {Array} details.args
   * @param {String} details.tense
   * @param {DescriptionContext} ctx
   * @param {Object} options entityStr options
   * @return {String}
   */
  str({args, tense}, ctx, options) {
    return this.compose({args:args, tense:tense}).str(ctx, options)
  }

  /**
   * @method compose
   * @param {Object} details
   * @param {Array} details.args
   * @param {String} [tense = "simple_present"]
   * @param {Object} options verbPhrase options
   * @return {Substitution}
   */
  compose({args, tense='simple_present'}, options) {
    let action = this.composeAction(args)
    return verbPhrase(action, tense, options)
  }

  /**
   * @method composeAction
   * @param {Array} orderedArgs
   * @return {Object}
   */
  composeAction(orderedArgs) {
    let action = this.associateArgs(orderedArgs)
    action._verb = this.verb
    for(let name in this.constants)
      action[name] = this.constants[name]
    return action
  }

  /**
   * @method composeSentax
   * @param {Array} orderedArgs
   * @param {String} tense
   * @returns {Sentax}
   */
  composeSentax(orderedArgs, tense) {
    let args = this.associateArgs(orderedArgs)
    for(let name in this.constants)
      args[name] = this.constants[name]

    return new Sentax({
      verb: this.verb,
      args: args,
      tense: tense,
    })
  }

  /**
   * @method composeSubjectNounPhrase
   * @param {Object} details
   * @param {Array} details.args
   * @param {String} details.tense
   * @return {Substitution}
   */
  composeSubjectNounPhrase({args, tense}) {
    return this.compose({args:args, tense:tense}, {nounPhraseFor:'_subject'})
  }

  /**
   * @method composePrepositionPhraseFor
   * @param {Number} argIndex
   * @param {Object} details
   * @param {Array} details.args
   * @param {String} details.tense
   * @return {Object}
   */
  composePrepositionPhraseFor(argIndex, {args, tense}) {
    return {
      preposition:'that',
      clause :this.compose(
        {args:args, tense:tense},
        {omit:this.params[argIndex].name}
      ),
      mainArgument: args[argIndex],
    }
  }

  /**
   * @method presentPrepositionClausesFor
   * @param {Number} argIndex
   * @param {Array} args
   * @return {Array}
   */
  presentPrepositionClausesFor(argIndex, args) {
    let list = []
    for(let tense of this.presentTenses)
      list.push(this.composePrepositionPhraseFor(
        argIndex, {args:args, tense:tense})
      )
    return list
  }

  /**
   * @method pastPrepositionClausesFor
   * @param {Number} argIndex
   * @param {Array} args
   * @return {Array}
   */
  pastPrepositionClausesFor(argIndex, args) {
    let list = []
    for(let tense of this.pastTenses)
      list.push(this.composePrepositionPhraseFor(
        argIndex, {args:args, tense:tense})
      )
    return list
  }

  /**
   *  Calculate a specificness score. Used to order predicates in PredicateSet.
   *  Low specificness should be processed last when parsing to avoid using
   *  problems.
   *  Eg to avoid using '_ is _' when '_ is in _' could have been used.
   *  @method getSpecificness
   *  @return {Number}
   */
  getSpecificness() {
    // Calculate a specificness score. Used to order predicates in PredicateSet.
    // Low specificness should be processed last when parsing to avoid using
    // problems.
    // Eg to avoid using '_ is _' when '_ is in _' could have been used.

    if(this.specificness)
      return this.specificness

    let score = this.verb.length
    for(let param of this.params) {
      if(param.name[0] != '_')
        score += param.name.length * (param.literal ? 1 : 3)
      //if(param.literal)
        //score -= 10
    }

    this.specificness = score
    return this.specificness
  }


  get hasLiterals() {
    return this.params.some(param => param.literal)
  }

  get dictionary() {
    if(this.predicate)
      return this.predicate.dictionary
  }
}
PredicateSyntax.prototype.isPredicateSyntax = true
module.exports = PredicateSyntax

},{"./Sentax":27,"./parse/ParsedSentence":40,"./parse/parseNounPhrase":48,"./util/conjugate/verbPhrase":63}],27:[function(require,module,exports){
const {sub} = require('./util/Substitution')
const verbPhrase = require('./util/conjugate/verbPhrase')
const SubjectContractedSentax = require('./SubjectContractedSentax')

/**
 * Contraction of Sentence-syntax.
 */
class Sentax {
  constructor({verb, args={}, tense='simple_present'}) {
    this.verb = verb
    this.args = args
    this.tense = tense
  }

  get subject() {
    return this.args._subject
  }
  set subject(subject) {
    this.args._subject = subject
  }

  get object() {
    return this.args._object
  }
  set object(object) {
    this.args._object = object
  }

  composeAction() {
    let action = {}
    Object.assign(action, this.args)
    action._verb = this.verb
    return action
  }

  compose(verbPhraseOptions) {
    return verbPhrase(this.composeAction(), this.tense, verbPhraseOptions)
  }

  str(ctx, entityStrOptions) {
    return this.compose().str(ctx, entityStrOptions)
  }

  static merge(...sentaxs) {
    let verb = sentaxs[0].verb
    let tense = sentaxs[0].tense

    let args = {}
    for(let sentax of sentaxs) {
      if(sentax.verb != verb || sentax.tense != tense) {
        console.warn('cannot merge sentaxs whos verbs and tense don\'t agree')
        return null
      }

      for(let key in sentax.args) {
        let arg = sentax.args[key]
        if(arg.constructor != Array)
          arg = [arg]

        if(!args[key])
          args[key] = []

        for(let e of arg)
          if(!args[key].includes(e))
            args[key].push(e)
      }
    }

    for(let i in args)
      if(args[i].length == 1)
        args[i] = args[i][0]

    return new Sentax({
      verb: verb,
      tense: tense,
      args: args,
    })
  }

  static contractPair(A, B) {
    if(!B.isSentax)
      throw 'improper use of Sentax.contractPair'
    if(A.isSentax) {
      if(A.verb == B.verb && A.subject == B.subject && A.tense == B.tense)
        return Sentax.merge(A, B)
      else if(A.subject == B.subject)
        return new SubjectContractedSentax(A, B)
      else return null
    } else if(A.isSubjectContractedSentax) {
      if(A.subject == B.subject) {
        //for(let i in A.sentaxs) {
        let C = A.sentaxs[A.sentaxs.length-1]
        if(C.verb == B.verb && C.tense == B.tense) {
          let out = new SubjectContractedSentax(...A.sentaxs)
          out.sentaxs[out.sentaxs.length-1] = Sentax.merge(C, B)
          return out
        }
      //  }

        // otherwise)
        return new SubjectContractedSentax(...A.sentaxs, B)
      }
    }
  }

  static *contract(...sentaxs) {
    for(let i=0; i<sentaxs.length; i++) {
      let A = sentaxs[i]
      let j
      for(j=i+1; j<sentaxs.length; j++) {
        let B = sentaxs[j]
        let C = Sentax.contractPair(A, B)
        if(C)
          A = C
        else
          break
      }
      i = j - 1

      yield A
    }
  }
}
Sentax.prototype.isSentax = true
module.exports = Sentax

},{"./SubjectContractedSentax":34,"./util/Substitution":59,"./util/conjugate/verbPhrase":63}],28:[function(require,module,exports){
const EventEmitter = require('events')
const SentenceQueue = require('./SentenceQueue')
// ...more requires at bottom


/**
 * @class Sentence
 * @extends EventEmitter
 * @constructor
 * @param {Predicate} predicate
 * @param {Array} args
 */
class Sentence extends EventEmitter {
  constructor(predicate=null, args=null) {
    super()

    if(!predicate)
      console.warn('WARNING: Sentence created without predicate.')

    /** A Predicate object defining the relationship between the
     *  arguments
     * @property {Predicate} predicate
     */
    this.predicate = predicate

    /**
     * an array of Entity/String arguments
     * @property {Array} args
     */
    this.args = args // an array of Entity/String arguments

    /**
     * The truth value of the sentnece. May be `'true'`, `'planned'`,
     * `'false'`, `'failed'`, `'past'`, `'hypothetical'` or `'superfluous'`
     * @property {String} truthValue
     * @default "hypothetical"
     */
    this.truthValue = 'hypothetical'

    /**
     * A list of sentences which cause this sentence.
     * @property {Array} causes
     * @default []
     */
    this.causes = []

    /**
     * A the number of causes.
     * @property {Number} causeCount
     */
    this.causeCount = 0

    /**
     * a list keeping track of all currently active clause objects
     * @property {Array} presentClauses
     */
    this.presentClauses = []
    /**
     * a list keeping track of all past tense clause objects
     * @property {Array} pastClauses
     */
    this.pastClauses = []
  }

  /**
   * Check to see if the arguments are compatible with the predicate in
   * terms of their type.
   * @method checkArgs
   * @return {Boolean}
   */
  checkArgs() {
    return this.predicate.checkArgs(this.args)
  }

  /**
   * If this sentence already exists in the arguments' fact lists return
   * the already existing version. Otherwise false.
   * @method trueInPresent
   * @return {Sentence|null}
   */
  trueInPresent() {
    if(this.truthValue == 'true')
      return this

    if(this.truthValue == 'hypothetical') {
      for(let arg of this.entityArgs) {
        for(let fact of arg.facts)
          if(Sentence.compare(fact, this)) {
            this.truthValue = 'superfluous'
            this.trueVersion = fact
            return fact
          }
      }
      return null
    }


    // the present truth value for sentences without entity arguments is undefined
    return undefined
  }

  /**
   * Check whether the sentence was true in the past.
   * @method trueInPast
   * @return {Boolean}
   */
  trueInPast() {
    if(this.truthValue == 'past')
      return true

    if(this.truthValue == 'hypothetical')
      for(let arg of this.args)
        if(arg.isEntity)
          return arg.history.some(fact => Sentence.compare(fact, this))
  }

  /**
   * Get a list of all arguments which are entities, including those from
   * embedded sub-sentences.
   * @attribute recursiveEntityArgs
   * @readOnly
   * @type {Array}
   */
  get recursiveEntityArgs() {
    let all = []
    for(let arg of this.args)
      if(arg.isNounPhraseSentence)
        all.push(...arg.recursiveEntityArgs)
      else if(arg.isEntity)
        all.push(arg)

    return all
  }

  /**
   * Attach facts and preposition clauses to the Entity arguments.
   * @method addFactsAndClauses
   * @return {null}
   */
  addFactsAndClauses() {
    if(!this.predicate.dontObserve)
      for(let i=0; i<this.args.length; i++) {
        let arg = this.args[i]
        if(arg.isEntity) {
          // emit on('fact') event
          arg.emit('fact', this)

          // add sentence to argument's fact set
          arg.facts.push(this)

          for(let clause of this.predicate.presentPrepositionClausesFor(i, this.args)) {
            arg.addClause(clause.preposition, clause.clause)

            // rmb the clause so it can be removed later (when `stop` is called)
            this.presentClauses.push(clause)
          }
        }
      }
  }

  /**
    * Starts a sentence.
    * @method start
    * @return Sentence or SentenceQueue (if postponed by prepare)
    */
  start() {
    // throw an error if this.checkArgs() fails
    if(!this.checkArgs()) {
      throw 'sentence has illegal args'
    }

    // exit early if predicate's skipIf returns truthy value
    if(this.predicate.skipIf) {
      let skip = this.predicate.skipIf(...this.args, this)
      if(skip) {
        this.truthValue = 'skipped'

        return this
      }
    }

    if(this.predicate.replace) {
      let replacement = this.predicate.replace(...this.args, this)
      if(replacement) {
        this.truthValue = 'replaced'

        if(replacement.isSentence)
          replacement = [replacement]

        let countDown = replacement.length

        for(let sentence of replacement) {
          sentence.once('stop', () => {
            countDown--
            if(!countDown) {
              this.stop()
            }
          })
          sentence.start()
        }

        return this
      }
    }

    // if prepare is defined in the predicate, queue the the preparation and
    // reschedule this.start()
    if(this.predicate._prepare && !this.preparationQueue) {
      let preparationSentences = this.predicate._prepare(...this.args, this)
      if(preparationSentences) {
        if(preparationSentences.isSentence)
          preparationSentences = [preparationSentences]
        // create a new queue of the preparation sentences
        let queue = new SentenceQueue(...preparationSentences)
        this.preparationQueue = queue

        // reschedule this sentence start to after the queue
        queue.once('stop', () => this.start())

        // set truth value to planned
        this.truthValue = 'planned'

        // fail this sentence if the queue fails
        queue.on('problem', reasons => this.fail(reasons))

        // start the queue
        queue.start()

        // exit
        return this
      }
    }

    // skip declare if is already true according to this.predicate.check()
    if(!(this.predicate.check && this.predicate.check(...this.args, this))) {

      // exit early if there are problems according to this.predicate.problem()
      if(this.predicate.problem) {
        let problems = this.predicate.problem(...this.args, this)
        if(problems) {
          this.fail(problems)
          return this
        }
      }

      // DECLARE: ie' make the sentence true by altering the entity structure
      // execute nested NounPhraseSentences in arguments
      let n = 0
      for(let i in this.args) {
        if(this.args[i].isNounPhraseSentence) {
          this.args[i].start() // .start() in new implementation
          this.args[i] = this.args[i].mainArgument
          n++
        }
      }
      // check arguments again
      if(n && !this.checkArgs())
        throw 'sentence has illegal args after executing nested sentences'

      // execute the predicate on the args
      if(this.predicate._begin)
        this.predicate._begin(...this.args, this)
    }

    // skip observe if is already true according to this.trueInPresent()
    let alreadyExistingVersion = this.trueInPresent()
    if(alreadyExistingVersion) {
      alreadyExistingVersion.once('stop', () => this.stop())
      return alreadyExistingVersion
    } else {
      // OBSERVE:

      // set truth value to true
      this.truthValue = 'true'
      this.causeCount++

      // add facts and clauses
      this.addFactsAndClauses()

      if(this.predicate.meanwhile) {
        let consequences = this.predicate.meanwhile(...this.args, this)
        if(consequences) {
          if(consequences.isSentence)
            consequences = [consequences]
          for(let consequence of consequences)
            consequence.addCause(this)
        }
      }

      if(this.predicate._expand) {
        let expansion = this.predicate._expand(...this.args, this)
        if(expansion) {
          if(expansion.constructor != Array)
            expansion = [expansion]
          let queue = new SentenceQueue(...expansion)
          queue.once('stop', () => this.stop())
          queue.on('problem', reasons => this.fail(reasons))
          queue.start()
        }
      }

      // call the predicate's `until` function if it exists
      if(this.predicate.until)
        this.predicate.until(
          () => this.stop(),
          ...this.args, this,
        )

      /**
       * Emitted when a sentence successfully starts
       * @event start
       * @deprecated
       */
      this.emit('start')
      this.startTime = new Date().getTime()

      // return self
      return this
    }
  }


  /**
   * Stops the sentence.
   * @method stop
   */
  stop() {
    // make the sentence no longer true
    this.stopTime = new Date().getTime()
    this.elapsedTime = this.stopTime-this.startTime

    if(this.truthValue == 'superfluous' || this.truthValue == 'replaced') {
      this.emit('stop')
      return this
    }

    // exit early if sentence is not 'true'
    if(this.truthValue != 'true' /*&& this.truthValue != 'planned'*/) {
      /*console.warn(
        'rejected sentence stop because truth value = ' + this.truthValue,
        '('+this.str()+')'
      )*/
      return this
    }



    // set truth value to 'past'
    this.truthValue = 'past'

    // call _afterwards semantic function and handle consequences
    if(this.predicate._afterwards) {
      // call _afterwards. It may return any a Sentence or array of sentences as
      // consequences.
      let consequences = this.predicate._afterwards(...this.args, this)
      if(consequences) {
        // start a single-sentence consequence
        if(consequences.isSentence)
          consequences.start()
        // start list of consequence sentences
        else if(consequences.constructor == Array)
          for(let sentence of consequences)
            sentence.start()
      }
    }

    // remove preposition clauses
    for(let {mainArgument, preposition, clause} of this.presentClauses)
      mainArgument.removeClause(preposition, clause)

    // remove facts from arguments
    for(let arg of this.entityArgs) {
      //let arg = this.args[i]
      arg.emit('factOff', this)
      arg.facts.splice(arg.facts.indexOf(this), 1)
    }

    // call observe past
    this.observePast()

    /**
     * Emitted when the sentence has successfully stopped.
     * @event stop
     */

    // emit stop event
    this.emit('stop')
  }


  /**
   * Called when the sentence becomes past-tense
   * @method observePast
   */
  observePast() {
    // observe that this sentence is now in the past

    for(let i in this.args) {
      let arg = this.args[i]

      // add fact to arguments history
      if(arg.history
      && !arg.history.some(fact => Sentence.compare(fact, this))) {

        arg.history.push(this)

        for(let clause of this.predicate.pastPrepositionClausesFor(i, this.args)) {
          // attach clause to arg
          arg.addClause(clause.preposition, clause.clause)

          // remember the clause so it can be removed later
          this.pastClauses.push(clause)
        }
      }
    }
  }

  /**
   * Fails the sentence.
   * @method fail
   * @param reasons
   */
  fail(reasons) {
    this.truthValue = 'failed'
    this.failureReason = reasons

    /**
     * Emitted when there is a predicate defined problem starting
     * the sentence.
     * @event problem
     * @param failureReason
     */
    this.emit('problem', reasons)
  }

  /**
   * Generate a string version of the sentence.
   * @method str
   * @param {String} [tense = "simple_present"]
   * @param {DescriptionContext} ctx
   * @param {Object} entityStrOptions
   * @return {String}
   */
  str(tense='simple_present', ctx, entityStrOptions) {
    return this.predicate.str(
      {args: this.args, tense:tense},
      ctx, entityStrOptions
    )
  }

  /**
   * Generate a substitution version of the sentence.
   * @method str
   * @param {String} [tense = "simple_present"]
   * @param {DescriptionContext} ctx
   * @param {Object} entityStrOptions
   * @return {String}
   */
  compose(tense='simple_present', verbPhraseOptions) {
    return this.predicate.compose(
      {args: this.args, tense:tense},
      verbPhraseOptions,
    )
  }

  /**
   * Generate the Sentax versions of this sentence for a given tense.
   * @method sentax
   * @param {String} [tense = 'simple_present']
   * @returns {Array} An array of Sentax objects.
   */
  sentaxs() {
    let tense = 'simple_present'
    switch(this.truthValue) {
      case 'true':
        tense = 'simple_present'
        break
      case 'past':
        tense = 'simple_past'
        break
      case 'hypothetical':
        tense = 'possible_past'
        break
      case 'planned':
        tense = 'simple_future'
        break
      default:
        console.warn('Sentence:.sentax() Unexpected truth value:', this.truthValue)
    }

    return this.predicate.forms.map(
      form => form.composeSentax(this.args, tense)
    )
  }

  /**
   * Choose a random Sentax version of this sentence for a given tense.
   */
  randomSentax(tense='simple_present') {
    return this.predicate.randomForm().composeSentax(this.args, tense)
  }

  /**
   * Check equality of two sentences
   * @method compare
   * @static
   * @param {Sentence} P
   * @param {Sentence} Q
   * @return {Boolean}
   */
  static compare(P, Q) {
    // Compare two sentences, P and Q.
    // Return true if both the predicates and the arguments match.

    if(P == Q) // if P and Q are the same object, they are equal
      return true

    // P and Q are inequal if they have diferent prediactes
    if(P.predicate != Q.predicate) {
      return false
    }

    // P and Q are inequal if any of the arguments don't agree
    for(let i in P.args)
      if(P.args[i] != Q.args[i]) {
        return false
      }

    // if we reach this point without returning false, P and Q are equal!
    return true
  }

  /**
   * Quick constructor for sentence objects.
   * @method S
   * @static
   * @param {Predicate/String} predicate
   *  The predicate or a camel case name referencing a the predicate.
   * @param {Entity/String} ...args
   *  The arguments.
   * @return {Sentence}
   */
  static S(predicate, ...args) {
    if(!predicate.isPredicate) {
      let dictionary
      for(let arg of args)
        if(arg && arg.dictionary)
          dictionary = arg.dictionary
      if(dictionary)
        predicate = dictionary.predicates.byName[predicate]
      else
        throw "Sentence.S expects a predicate as first argument."
          +" Recieved: " + predicate
    }
    let sentence = new Sentence(predicate, args)
    //sentence = sentence.trueInPresent() || sentence
    return sentence
  }

  /**
   * @attribute entityArgs
   * @readOnly
   * @type {Array}
   */
  get entityArgs() {
    return this.args.filter(arg => arg.isEntity)
  }

  /**
   * @method randomEntityArg
   * @return {Entity}
   */
  randomEntityArg() {
    let entityArgs = this.args.filter(arg => arg.isEntity)
    return entityArgs[Math.floor(Math.random()*entityArgs.length)]
  }

  // Causes:
  addCause(sentence) {
    let trueVersion = sentence.trueInPresent()

    if(trueVersion) {
      // cause is true, so add to list, start this sentence and listen for stop
      this.causes.push(trueVersion)
      trueVersion.once('stop', () => this.removeCause(trueVersion))

      if(this.truthValue == 'hypothetical')
        this.start()

      else if(this.truthValue != 'true')
        console.warning('strange cause behaviour')

      else
        this.causeCount++

    } else
      throw 'A sentence must be true for it to be a cause of another sentence.'

  }

  removeCause(sentence) {
    let i = this.causes.findIndex(cause => Sentence.compare(sentence, cause))
    if(i != -1) {
      this.causes.splice(i, 1)
      this.causeCount--

      if(this.truthValue == 'true' && this.causeCount <= 0)
        this.stop()
    } else
      console.warn('tried to remove a cause which doesn\'t exist')
  }

  getProblems() {
    if(!this.predicate.problem)
      return false
    return this.predicate.problem(...this.args, this)
  }

  get banal() {
    return this.predicate.banal
  }
}
Sentence.prototype.isSentence = true
module.exports = Sentence

},{"./SentenceQueue":31,"events":362}],29:[function(require,module,exports){
const placeholderRegex = /#_/g

class SentenceModifier {
  constructor(template, exec, {
    prefix = true,
    suffix = true,
    name,
  }={}) {

    this.template = template

    let placeholders = template.match(placeholderRegex)
    if(placeholders) {
      this.params = placeholders.map(ph => ({
        number: ph[0] == '#',
      }))
    }

    this.unboundRegex = new RegExp(
      template.replace(/#_/g, '([0-9.]+)')
    )

    /* Bool: whether the modifier can be prefixed to a sentence */
    this.prefix = prefix
    if(prefix)
      this.prefixRegex = new RegExp('^'+this.unboundRegex.source+',? ', 'i')

    /* Bool: whether the modifier can be suffixed to a sentence */
    this.suffix = suffix
    if(suffix)
      this.suffixRegex = new RegExp(',? '+this.unboundRegex.source+'$', 'i')

    this.name = name
    this.exec = exec
  }

  parse(str) {
    return (this.parsePrefix(str) || this.parseSuffix(str)) || null
  }

  parsePrefix(str) {
    if(!this.prefix)
      return null

    let result = this.prefixRegex.exec(str)
    if(result) {
      let args = this.parseArgs(result.slice(1))
      if(args)
        return {
          args: args,
          remainder: str.slice(result[0].length),
          modifier: this,
        }
    }

    return null
  }

  parseSuffix(str) {
    if(!this.suffix)
      return null

    let result = this.suffixRegex.exec(str)
    if(result) {
      let args = this.parseArgs(result.slice(1))
      if(args)
        return {
          args: args,
          remainder: str.slice(0, -result[0].length),
          modifier: this,
        }
    }
    return null
  }

  parseArgs(args) {
    for(let i in args)
      if(this.params[i].number) {
        args[i] = parseFloat(args[i])
        if(isNaN(args[i]))
          return null
      }

    return args
  }
}
SentenceModifier.prototype.isModifier = true
module.exports = SentenceModifier

},{}],30:[function(require,module,exports){
const SentenceModifier = require('./SentenceModifier')

class SentenceModifierSet {
  constructor(...modifiers) {
    this.modifiers = []

    for(let modifier of modifiers)
      this.addModifier(modifier)
  }

  addModifier(mod) {
    if(!mod.isModifier)
      mod = new SentenceModifier(mod)

    if(mod.isModifier)
      this.modifiers.push(mod)
  }

  parse(str) {
    // first check all prefixes
    for(let mod of this.modifiers){
      let result = mod.parsePrefix(str)
      if(result)
        return result
    }

    // then check all suffixes
    for(let mod of this.modifiers) {
      let result = mod.parseSuffix(str)
      if(result)
        return result
    }

    // otherwise
    return null
  }
}
module.exports = SentenceModifierSet

},{"./SentenceModifier":29}],31:[function(require,module,exports){
// a list of sentence to be executed consequetively
const {sub} = require('./util/Substitution')

const EventEmitter = require('events')

/**
 * @class SentenceQueue
 * @extends EventEmitter
 * @constructor
 * @param {Sentence} ...sentences
 */

class SentenceQueue extends EventEmitter {
  constructor(...sentences) {
    super()

    /**
     * @property {Array} sentence
     */
    this.sentences = []
    /**
     * Index of the next sentence to start.
     * @property {Number} i
     */
    this.i = 0

    for(let sentence of sentences)
      this.appendSentence(sentence)
  }

  /**
   * Adds a sentence to the end of the queue.
   * @method appendSentence
   * @param {Sentence} sentence
   */
  appendSentence(sentence) {
    if(sentence && sentence.truthValue == 'hypothetical') {
      this.sentences.push(sentence)
      sentence.truthValue = 'planned'
    } else
      throw "Can only append hypothetical sentence to queue."
        + '(\"' + sentence.str() + '\" is '
        + sentence.truthValue + ')'
  }

  /**
   * Begin processing the queue.
   * @method start
   */
  start() {
    /**
     * @event start
     */
    this.emit('start')
    this.startNextSentence()
  }

  /**
   * Start the next sentence in the queue and increment `i`, or emit `stop` (if
   * reached the end).
   * @method startNextSentence
   */
  startNextSentence() {
    let sentence = this.sentences[this.i++]

    if(sentence) {
      //sentence.once('stop', () => this.startNextSentence())
      //sentence.on('problem', reasons => this.emit('problem', reasons))
      let result = sentence.start()
      switch(result.truthValue) {
        case 'skipped': // sentence was skipped
        case 'past': // sentence was instantaneously true
          // start next sentence immediately
          this.startNextSentence()
          break;

        case 'replaced': // sentence has been replaced with something else
        case 'planned': // sentence start has been postponed to a later time
        case 'true': // sentence started straight away
          // wait for stop event, then start next sentence
          result.once('stop', () => this.startNextSentence())
          break

        case 'failed':
          let reason = sub(
            '_ because _',
            result.str('negative_possible_present'),
            result.failureReason,
          )
          this.fail(reason)
          break;

        default:
          // send a warning if truth value can't be handled
          console.warn(
            'SentenceQueue found sentence',
            result, '('+result.str()+')',
            'with unexpected truth value:',
            result.truthValue,
          )
      }

    } else {
      /**
       * @event stop
       */
      this.emit('stop')
    }
  }

  fail(reasons) {
    this.emit('problem', reasons)
  }
}
module.exports = SentenceQueue

},{"./util/Substitution":59,"events":362}],32:[function(require,module,exports){
const SpecialSyntax = require('./SpecialSyntax')
const ParsedSpecialSentence = require('./parse/ParsedSpecialSentence')


class SpecialSentenceSyntax extends SpecialSyntax {
  constructor(template, {start, stop}={}) {
    super(template)

    this.start = start
    this.stop = stop
  }

  parseSentence(str, ctx, subject) {
    let args = this.parse(str, ctx, subject)
    if(args)
      return new ParsedSpecialSentence({
        args: args,
        syntax: this,
      }, this.dictionary, ctx)
  }
}
module.exports = SpecialSentenceSyntax

},{"./SpecialSyntax":33,"./parse/ParsedSpecialSentence":41}],33:[function(require,module,exports){
const placeholderRegex = /(?:@|#|L|~)?_/g
const parse = require('./parse')
const politeList = require('./util/politeList')

class SpecialSyntax {
  constructor(template) {
    this.template = template
    this.params = []
    this.dictionary = null

    let regsrc = template
    let ph
    while(ph = placeholderRegex.exec(template)) {
      ph = ph[0]
      let param = {
        NP: ph[0] == '_',   // entity
        list: ph[0] == 'L',     // list of entities
        number: ph[0] == '#',   // number
        literal: ph[0] == '@',  // string
        sentence: ph[0] == '~'  // sentence
      }
      this.params.push(param)


      regsrc = regsrc.replace(ph, param.number ? '([0-9\.]+)' : '(.+)')
    }

    this.regexUnbounded = new RegExp(regsrc, 'i')
    this.regex = new RegExp('^' + regsrc + '$', 'i')
  }

  parse(str, ctx, subject) {
    if(!this.dictionary)
      throw 'SpecialSyntax cannot parse without a dictionary'

    let result = this.regex.exec(str)
    if(!result)
      return null

    // Otherwise,
    let args = result.slice(1)
    for(let i in this.params) {
      let param = this.params[i]

      // parse as NounPhrase
      if(param.NP) {
        args[i] = parse.nounPhrase(args[i], this.dictionary, ctx)
        if(!args[i])
          return null
      }

      else if(param.number) {
        args[i] = parseFloat(args[i])
        if(isNaN(args[i]))
          return null
      }

      else if(param.list) {
        let list = politeList.parse(args[i])
        if(!list)
          return null
        for(let j in list) {
          list[j] = parse.nounPhrase(list[j], this.dictionary, ctx)
          if(!list[j])
            return null
        }
      }

      else if(param.literal) {
        continue
      }

      else if(param.sentence) {
        let sentence = parse.sentence(args[i], this.dictionary, ctx)

        if(!sentence && subject)
          sentence = parse.imperative(subject, args[i], this.dictionary, ctx)

        if(sentence)
          args[i] = sentence
        else
          return null
      }
    }

    return args
  }
}
SpecialSyntax.prototype.isSpecialSyntax = true
module.exports = SpecialSyntax

},{"./parse":45,"./util/politeList":70}],34:[function(require,module,exports){
const {sub} = require('./util/Substitution')

class SubjectContractedSentax {
  constructor(...sentaxs) {
    this.subject = sentaxs[0].subject
    for(let sentax of sentaxs)
      if(sentax.subject != this.subject)
        throw 'Subjects must match in a SubjectContractedSentax'

    this.sentaxs = sentaxs
  }

  compose() {
    let preds = this.sentaxs.map(sentax => sentax.compose({omit:'_subject'}))
    return sub('S_ _', this.subject, preds)
  }

  str(ctx, entityStrOptions) {
    return this.compose().str(ctx, entityStrOptions)
  }
}
SubjectContractedSentax.prototype.isSubjectContractedSentax = true
module.exports = SubjectContractedSentax

},{"./util/Substitution":59}],35:[function(require,module,exports){
/**
  * A class for generating descriptions by following relationships between
  * objects.
  * @class WanderingDescriber
  * @constructor
  * @param {Sentence|Entity} ...toLog
  */
class WanderingDescriber {
  constructor(...toLog) {
    this.history = []
    this.recentlyMentionedEntitys = []
    this.maxLookback = 5
    this.includeHistory = false

    this.log(...toLog)
  }

  /**
   * @method log
   * @param {Sentence|Entity} ...args
   */
  log(...args) {
    for(let arg of args) {
      if(arg.isSentence) {
        // handle Sentence
        let sentence = arg
        this.history.push(sentence)
        this.recentlyMentionedEntitys.push(...sentence.entityArgs)
        while(this.recentlyMentionedEntitys.length > this.maxLookback)
          this.recentlyMentionedEntitys.shift()
      } else if(arg.isEntity) {
        // handle Entity
        let entity = arg
        this.recentlyMentionedEntitys.push(entity)
        while(this.recentlyMentionedEntitys.length > this.maxLookback)
          this.recentlyMentionedEntitys.shift()
      }
    }
  }

  /**
   * @method next
   * @return {Sentence|null}
   */
  next() {
    let facts = this.allFactsShuffled()
    for(let fact of facts) {
      if(!fact.predicate.banal && !this.history.includes(fact)) {
        this.log(fact)
        return fact
      }
    }

    return null
  }

  /**
   * @method nextFew
   * @param {Number} howMany
   * @return {Array}
   */
  nextFew(howMany) {
    let list = []
    let facts = this.allFactsShuffled()
    for(let fact of facts) {
      if(!fact.predicate.banal && !this.history.includes(fact)) {
        this.log(fact)
        list.push(fact)
        if(list.length >= howMany)
          break
      }
    }

    return list
  }

  /**
   * @method allFactsShuffled
   * @return {Array}
   */
  allFactsShuffled() {
    let list = []
    for(let entity of this.recentlyMentionedEntitys) {
      list.push(...entity.facts)
      if(this.includeHistory)
        list.push(...entity.history)
    }
    return list.sort(() => Math.random()*2-1)
  }
}
module.exports = WanderingDescriber

},{}],36:[function(require,module,exports){
const parse = require('./parse')
const DescriptionContext = require('./DescriptionContext')
const {explore} = require('./search')
const uniqueCombine = require('./util/uniqueCombine')

function declare(dictionary, ctx=new DescriptionContext, ...strings) {
  let domain = []
  for(let str of strings) {
    let parsed = parse(str, dictionary, ctx)

    if(!parsed) {
      console.log('unable to parse:', str)
      break
    }

    if(parsed.isNounPhrase) {
      let out = parsed.spawn(domain, dictionary, ctx)
      domain = [...uniqueCombine(domain, explore(out))]
    } else if(parsed.isParsedSentence) {
      let sentence = parsed.start(domain, dictionary, ctx)
      if(sentence && sentence.truthValue == 'true') {
        domain = explore([...domain, ...sentence.entityArgs])
        domain = [...uniqueCombine(domain, explore(sentence.entityArgs))]
      } else
        console.warn('problem declaring:', str)
    } else if(parsed.isSpecialSentence) {
      parsed.start()
    } else
      console.warn('Unhandled declaration:', str, '\ntype:',parsed.constructor.name)
  }

  return {
    domain: domain,
    ctx: ctx
  }
}
module.exports = declare

function declareSingle(dictionary, ctx, domain, str) {
  let parsed = parse(str, dictionary, ctx)

  if(!parsed)
    throw 'unable to parse: ' + str

  if(parsed.isNounPhrase) {
    let out = parsed.spawn(domain, dictionary, ctx)
    domain = [...uniqueCombine(domain, explore(out))]
  } else if(parsed.isParsedSentence) {
    let sentence = parsed.start(domain, dictionary, ctx)
    if(sentence && sentence.truthValue == 'true') {
      domain = explore([...domain, ...sentence.entityArgs])
      domain = [...uniqueCombine(domain, explore(sentence.entityArgs))]
    } else
      throw 'problem declaring:' + str
  } else if(parsed.isSpecialSentence) {
    parsed.start()
  } else
    throw 'Unhandled declaration:'+ str + '\ntype: ' + parsed.constructor.name

  return {
    domain: domain,
    ctx: ctx,
  }
}
module.exports.single = declareSingle

},{"./DescriptionContext":16,"./parse":45,"./search":56,"./util/uniqueCombine":78}],37:[function(require,module,exports){
/*
  entityStr()
  Convert a entity into a string using a flexible set of parameters
*/

const {sub} = require('./util/Substitution')
const specarr = require('./util/specarr')
const entityPhraselet = require('./Entity_nounPhraseletStr')

function entityStr(entity, ctx, options={}) {
  // Convert an Entity into a noun phrase string.

  if(ctx) {
    let pronoun = ctx.getPronounFor(entity)
    if(pronoun) {
      ctx.log(entity, pronoun)
      return pronoun
    }
  }

  let properNoun = specarr.randomString(entity, entity.properNouns, ctx)
  if(properNoun) {
    if(ctx)
      ctx.log(entity, properNoun)
    return properNoun
  }

  let phraselet = entityPhraselet(entity, ctx, options)

  // choose the article
  let article = 'the'
  let ordinalAdjective = null
  if(ctx) {
    let articles = ctx.getArticles(entity, phraselet)

    article = articles[Math.floor(Math.random()*articles.length)]

    // if using 'the', choose an ordinal adjective
    if(article == 'the') {
      let adjs = ctx.getOrdinalAdjectives(entity, phraselet)
      if(adjs)
        ordinalAdjective = adjs[Math.floor(Math.random()*adjs.length)]
    }
  }

  if(ordinalAdjective)
    phraselet = sub('_ _', ordinalAdjective, phraselet)


  // compile and return final string
  let str = sub('_ _', article, phraselet).str(ctx, options)
  if(ctx)
    ctx.log(entity, str)
  return str
}
module.exports = entityStr

},{"./Entity_nounPhraseletStr":20,"./util/Substitution":59,"./util/specarr":73}],38:[function(require,module,exports){
/**
 * @module entity-game
 */

module.exports = {
  Dictionary: require('./Dictionary'),

  PredicateSyntax: require('./PredicateSyntax'),
  Predicate: require('./Predicate'),
  //PredicateSet: require('./PredicateSet'),


  Entity: require('./Entity'),
  parseImperative: require('./parseImperative'),
  Sentence: require('./Sentence'),
  S: require('./Sentence').S,
  //SentenceQueue: require('./SentenceQueue'),

  parse: require('./parse'),
  declare: require('./declare'),

  DescriptionContext: require('./DescriptionContext'),
  WanderingDescriber: require('./WanderingDescriber'),
  FactListener: require('./FactListener'),

  search: require('./search'),

  sentencify: require('./util/spellcheck').sentencify,
  unSentencify: require('./util/unSentencify'),

  EntitySpawner: require('./EntitySpawner'),
  SentenceModifier: require('./SentenceModifier'),

  SpecialSyntax: require('./SpecialSyntax'),
  SpecialSentenceSyntax: require('./SpecialSentenceSyntax'),

  randomSentence: require('./randomSentence'),

  Declarer: require('./Declarer'),

  sub: require('./util/Substitution').sub,

  html: require('../HTML-io'),

  //util: require('./util'),
}

},{"../HTML-io":4,"./Declarer":15,"./DescriptionContext":16,"./Dictionary":17,"./Entity":18,"./EntitySpawner":19,"./FactListener":21,"./Predicate":24,"./PredicateSyntax":26,"./Sentence":28,"./SentenceModifier":29,"./SpecialSentenceSyntax":32,"./SpecialSyntax":33,"./WanderingDescriber":35,"./declare":36,"./parse":45,"./parseImperative":54,"./randomSentence":55,"./search":56,"./util/Substitution":59,"./util/spellcheck":74,"./util/unSentencify":77}],39:[function(require,module,exports){
/*
  This is a bit like an entitiy, but it doesn't have the same symbollic value.
  It just represents a noun-phrase to be tested against a domain or spawned
*/

const infinityValue = 100
const uniqueCombine = require('../util/uniqueCombine')

class NounPhrase {
  constructor(dictionary, ctx) {
    this.dictionary = dictionary
    this.ctx = ctx
  }

  spawn(domain, dictionary=this.dictionary, ctx=this.ctx) {
    console.warn('.spawn() not defined for', this.constructor.name)
  }

  *find(domain, dictionary=this.dictionary, ctx=this.ctx) {
    console.warn('.find() not defined for', this.constructor.name)
  }

  findFirst(domain, dictionary, ctx) {
    for(let e of this.find(domain, dictionary, ctx))
      return e

    // Otherwise,
    return null
  }

  matches(e, dictionary=this.dictionary, ctx=this.ctx) {
    console.warn('.matches() not defined for', this.constructor.name)
  }

  findOrSpawn(domain, dictionary=this.dictionary, ctx=this.ctx) {
    // first try to find it:
    for(let e of this.find(domain, dictionary, ctx))
      return [e]

    // if unsuccessful, spawn it:
    let spawned = this.spawn(domain, dictionary, ctx)
    if(spawned)
      return spawned
    else
      return null
  }
}
NounPhrase.prototype.isNounPhrase = true
module.exports = NounPhrase

},{"../util/uniqueCombine":78}],40:[function(require,module,exports){
const Sentence = require('../Sentence')

class ParsedSentence {
  constructor(
    {tense, args, syntax, predicate=syntax.predicate},
    dictionary, ctx
  ) {
    this.tense = tense
    this.predicate = predicate
    this.args = args
    this.syntax = syntax

    this.dictionary = dictionary
    this.ctx = ctx
  }

  duplicate() {
    return new ParsedSentence({
      tense: this.tense,
      predicate: this.predicate,
      syntax: this.syntax,
      args: this.args.slice()
    }, this.dictionary, this.ctx)
  }

  get imperative() {
    return this.tense == 'imperative'
  }

  get subject() {
    if(this.syntax.paramsByName._subject)
      return this.args[this.syntax.paramsByName._subject.index]
    else
      return null
  }

  set subject(subject) {
    if(this.syntax.paramsByName._subject) {
      console.log(this.syntax.paramsByName._subject.index)
      this.args[this.syntax.paramsByName._subject.index] = subject
    } else
      throw 'ParsedSentence no subject parameter'
  }

  matches(sentence, ignoreArgIndex) {
    // Does this ParsedSentence match the given actualised Sentence object
    // do the predicates match?
    if(this.predicate != sentence.predicate)
      return false

    // TODO: tense checking

    for(let i in this.args) {
      if(i == ignoreArgIndex)
        continue

      if(this.args[i].isNounPhrase) {
        if(!this.args[i].matches(sentence.args[i]))
          return false
      } else if(this.args[i] != sentence.args[i])
        return false
    }
    // Otherwise,
    return true
  }

  create(domain=[], dictionary=this.dictionary, ctx=this.ctx) {
    let args = this.args.map(arg => {
      if(arg.isNounPhrase)
        return arg.findOrSpawn(domain, dictionary, ctx)[0]
      else
        return arg
    })

    let sentence = new Sentence(this.predicate, args)

    return sentence
  }

  start(domain, dictionary=this.dictionary, ctx=this.ctx) {
    let sentence = this.create(domain, this.dictionary, ctx)
    if(!sentence)
      throw 'Oh noo'
    return sentence.start()
  }
}
ParsedSentence.prototype.isParsedSentence = true
module.exports = ParsedSentence

},{"../Sentence":28}],41:[function(require,module,exports){
class ParsedSpecialSentence {
  constructor({args, syntax}, dictionary, ctx) {
    this.args = args
    this.syntax = syntax
    this.dictionary = dictionary
    this.ctx = ctx
  }

  start(domain, dictionary, ctx) {
    if(this.syntax.start)
      this.syntax.start(this.args, domain, dictionary, ctx)
    else {
      console.warn(
        'Unable to start special sentence because the syntax has no start function defined'
      )
    }
  }
  
  get imperative() {
    return this.args.some(arg => arg.imperative)
  }
}
ParsedSpecialSentence.prototype.isParsedSpecialSentence = true
ParsedSpecialSentence.prototype.isSpecialSentence = true
module.exports = ParsedSpecialSentence

},{}],42:[function(require,module,exports){
const NounPhrase = require('./NounPhrase')

class PronounNounPhrase extends NounPhrase {
  constructor({pronoun, str}, dictionary, ctx) {
    super(dictionary, ctx)
    this.pronoun = pronoun
    this.str = str
  }

  spawn(domain, dictionary=this.dictionary, ctx=this.ctx) {
    throw 'A PronounNounPhrase cannot be spawned.'
  }

  *find(domain, dictionary=this.dictionary, ctx=this.ctx) {
    let e = ctx.parse(this.pronoun)
    if(e)
      yield e
    return
  }

  matches(e, dictionary=this.dictionary, ctx=this.ctx) {
    return ctx.parse(this.pronoun) == e
  }
}
module.exports = PronounNounPhrase

},{"./NounPhrase":39}],43:[function(require,module,exports){
const NounPhrase = require('./NounPhrase')
const uniqueCombine = require('../util/uniqueCombine')
const {explore} = require('../search')

class ProperNounNounPhrase extends NounPhrase {
  constructor({properNoun, str}, dictionary, ctx) {
    super(dictionary, ctx)
    this.properNoun = properNoun
    this.str = str
  }

  spawn(domain, dictionary=this.dictionary, ctx=this.ctx) {
    throw 'A ProperNounNounPhrase cannot be spawned. ('+this.str+')'
  }

  *find(domain, dictionary=this.dictionary, ctx=this.ctx) {
    if(domain.isEntity)
      domain = [...explore([domain])]

    if(ctx)
      domain = uniqueCombine(
        ctx.referenceHistory.map(ref => ref.entity),
        domain,
      )

    for(let e of domain)
      if(this.matches(e, dictionary, ctx))
        yield e
  }

  matches(e, dictionary=this.dictionary, ctx=this.ctx) {
    return e.properNouns.includes(this.properNoun)
  }
}
module.exports = ProperNounNounPhrase

},{"../search":56,"../util/uniqueCombine":78,"./NounPhrase":39}],44:[function(require,module,exports){
const NounPhrase = require('./NounPhrase')
const uniqueCombine = require('../util/uniqueCombine')
const {explore} = require('../search')

class RegularNounPhrase extends NounPhrase {
  constructor(info, dictionary, ctx) {
    super(dictionary, ctx)

    Object.assign(this, info)
    this.facts = []
  }

  spawn(domain=[], dictionary=this.dictionary, ctx=this.ctx) {
    let {
      noun,
      min, max,
      adjectives,
      owner,
      facts,
      str,
    } = this

    if(max == Infinity)
      max = infinityValue
    let n = min + Math.floor(Math.random()*(max-min+1))

    // create owner
    let ownerEntity
    if(owner) {
      if(!dictionary.declareOwnership)
        throw 'Unable to spawn \"' + str + '\" because dictionary\'s .declareOwnership() function is undefined.'

      ownerEntity = owner.findOrSpawn(domain, dictionary, ctx)[0]
      if(!ownerEntity)
        throw 'cannot find owner'
    }


    let list = []
    for(let i=0; i<n; i++) {
      // Create a new entity.
      let e = dictionary.createEntity()

      // Set the noun.
      e.be_a(noun.noun)

      // Apply the adjectives.
      for(let adj of adjectives)
        e.be(adj)

      // Apply facts.
      let facts = this.facts.map(({fact, argIndex}) => {
        let copy = fact.duplicate()
        copy.args[argIndex] = e
        return copy.create(domain, dictionary, ctx)
      })
      for(let fact of facts)
        fact.start()

      // Apply ownership.
      if(owner && ownerEntity)
        dictionary.declareOwnership(ownerEntity, e)

      ctx.log(e, this.str)
      list.push(e)
    }

    return list
  }

  *find(domain, dictionary=this.dictionary, ctx=this.ctx) {
    if(this.article == 'another')
      return

    if(domain.isEntity)
      domain = [...explore([domain])]

    if(ctx)
      domain = uniqueCombine(
        ctx.referenceHistory.map(ref => ref.entity),
        domain,
      )

    if(this.min > 1 || this.max > 1)
      console.warn('parseNounPhrase.find does not take account of quantifiers')

    if(this.ordinal) {
      let n = 1
      for(let e of domain)
        if(this.matches(e, dictionary, ctx) && n++ == this.ordinal) {
          yield e
          return
        }
    } else
      for(let e of domain) {
        if(this.matches(e, dictionary, ctx)) {
          ctx.log(e, this.str)
          yield e
        }
      }
  }

  matches(e, dictionary=this.dictionary, ctx=this.ctx) {
    // REGULAR NOUN PHRASE
    let {
      noun,
      adjectives,
      owner,
      article,
    } = this

    if(article == 'another')
      return false


    // Noun must match.
    if(!e.is_a(noun.noun))
      return false


    // All adjectives must match.
    for(let adj of adjectives) {
      if(!e.adjectives.includes(adj))
        return false
    }

    // check the facts
    for(let {fact, argIndex} of this.facts) {
      if(!e.facts.some(
        sentence => (
          (sentence.args[argIndex] == e)
          && fact.matches(sentence, argIndex)
        )
      ))
        return false
    }

    // Owner must match
    if(owner) {
      if(dictionary.getOwners) {
        if(!dictionary.getOwners(e).some(f => owner.match(f, dictionary, ctx)))
          return false
      } else
        throw 'Unable to find \"' + this.str + '\" because dictionary.getOwners() is not defined'
    }

    // Otherwise,
    return true
  }
}
module.exports = RegularNounPhrase

},{"../search":56,"../util/uniqueCombine":78,"./NounPhrase":39}],45:[function(require,module,exports){
function parse(str, dictionary, ctx) {
  let result


  return parseSpecialSentence(str, dictionary, ctx)
    || parseSpecialSentence.imperative(undefined, str, dictionary, ctx)
    || parseNounPhrase(str, dictionary, ctx)
}

module.exports = parse

const parseSentence = require('./parseSentence')
const parseNounPhrase = require('./parseNounPhrase')
const parseOrdinal = require('./parseOrdinal')
const parsePossessive = require('./parsePossessive')
const parseQuantifier = require('./parseQuantifier')
const parseSpecialSentence = require('./parseSpecialSentence')

Object.assign(module.exports, {
  sentence: parseSpecialSentence,
  imperative: parseSpecialSentence.imperative,
  simpleSentence: parseSentence,
  simpleImperative: parseSentence.imperative,
  nounPhrase: parseNounPhrase,
  ordinal: parseOrdinal,
  possessive: parsePossessive,
  quantifier: parseQuantifier,
})

},{"./parseNounPhrase":48,"./parseOrdinal":49,"./parsePossessive":50,"./parseQuantifier":51,"./parseSentence":52,"./parseSpecialSentence":53}],46:[function(require,module,exports){
function parseEmbeddedSentence(str, dictionary, ctx) {
  let result
  for(let syntax of dictionary.predicates.syntaxs) {
    if(result = syntax.parseEmbeddedSentence(str, ctx))
      return result
  }
}
module.exports = parseEmbeddedSentence

},{}],47:[function(require,module,exports){
const {toSingular} = require('../util/plural')

function parseNoun(str, dictionary) {
  // check phrasal nouns
  for(let noun of dictionary.phrasalNouns) {
    let info = noun.parse(str)
    if(info)
      return info
  }

  // check last word against nouns
  let lastWord = str.slice((str.lastIndexOf(' ') + 1))
  let lastWord2 = toSingular(lastWord)
  if(dictionary.nouns[lastWord] || dictionary.nouns[lastWord2]) {
    let noun = dictionary.nouns[lastWord] || dictionary.nouns[lastWord2]
    let info = noun.parse(str)
    return info
  }
}
module.exports = parseNoun

},{"../util/plural":69}],48:[function(require,module,exports){
const {toSingular} = require('../util/plural')

const properNounRegex = /^([A-Z][a-zA-Z]+)( [A-Z][a-zA-Z]+)*$/
const pronounRegex = /^(?:me|you|her|him|it|us|them)$/i
const articleRegex = /^(the|a|an)$/i

const NounPhrase = require('./NounPhrase')
const RegularNounPhrase = require('./RegularNounPhrase')
const PronounNounPhrase = require('./PronounNounPhrase')
const ProperNounNounPhrase = require('./ProperNounNounPhrase')
const parseNoun = require('./parseNoun')
const parseQuantifier = require('./parseQuantifier')
const parseOrdinal = require('./parseOrdinal')
const DescriptionContext = require('../DescriptionContext')
const parseEmbeddedSentence = require('./parseEmbeddedSentence')


function parseNounPhrase(str, dictionary, ctx=new DescriptionContext) {
  // Is it a proper noun?
  let embedded = parseEmbeddedSentence(str, dictionary, ctx)
  if(embedded)
    return embedded

  let proper = properNounRegex.exec(str)
  if(proper)
    return new ProperNounNounPhrase({properNoun: str, str:str}, dictionary, ctx)

  // Is it a pronoun?
  let pronoun = pronounRegex.exec(str)
  if(pronoun)
    return new PronounNounPhrase({pronoun:str, str:str}, dictionary, ctx)

  // Parse as a regular noun-phrase.
  let info = parseNoun(str, dictionary)

  if(!info)
    return null

  let {noun, remainder, plural} = info
  let owner = null
  let article = null
  let range = plural ? {min:1, max:Infinity} : {min:1, max:1}
  let ordinal
  let definite

  // Look for a possessive adjective or a quantifier.
  let result = parsePossessive(remainder, dictionary)
  if(result) {
    remainder = result.remainder.trim()
    owner = result.owner
  } else if(result = parseQuantifier(remainder, dictionary)) {
    remainder = result.remainder.trim()
    article = result.article
    definite = result.definite
    if(result.min && result.max)
      range = rangeOverlap(range, result)
  } else {
    console.warn('Noun phrase has no article, quantifier or possessive:', str)
    return null
  }

  // Treat the remaining words as adjectives
  let words = remainder.split(' ').filter(adj => adj.length)
  if(words[0] && (ordinal = parseOrdinal(words[0])))
    words.shift()

  let adjectives = words

  if(range.min > range.max || (!definite && ordinal)) {
    console.warn('Illogical noun phrase: ' + str)
    return null
  }

  return new RegularNounPhrase({
    str: str,
    owner: owner,
    article: article,
    definite: definite,
    ordinal: ordinal,
    adjectives: adjectives,
    noun: noun,
    min: range.min,
    max: range.max,
  }, dictionary, ctx)
}
module.exports = parseNounPhrase

const parsePossessive = require('./parsePossessive')

function rangeOverlap(range1, range2) {
  return {
    min: Math.max(range1.min, range2.min),
    max: Math.min(range1.max, range2.max)
  }
}

},{"../DescriptionContext":16,"../util/plural":69,"./NounPhrase":39,"./PronounNounPhrase":42,"./ProperNounNounPhrase":43,"./RegularNounPhrase":44,"./parseEmbeddedSentence":46,"./parseNoun":47,"./parseOrdinal":49,"./parsePossessive":50,"./parseQuantifier":51}],49:[function(require,module,exports){
const ordinal = require('integer-to-ordinal-english')

const LIMIT = 10

function parseOrdinal(str) {
  if(/^[0-9]+(?:th|st|nd|rd)(?= |$)/.test(str)){
    let n = parseInt(str)
    if(!isNaN(n))
      return n
  }

  str = str.toLowerCase()

  for(let i=1; i<LIMIT; i++) {
    if(ordinal(i).toLowerCase() == str)
      return i
  }

  // Otherwise,
  return null
}
module.exports = parseOrdinal

},{"integer-to-ordinal-english":7}],50:[function(require,module,exports){
// look for a possessive in a pre-noun string.

const regex = /(.*)((?:'s)|(?:(?<=s)'))/g

const pronounMap = { // possessive => object-form
  my: 'me',
  your: 'you',
  his: 'him',
  her: 'her',
  our: 'us',
  its: 'it',
  their: 'them',
}

function parsePossessive(str, dictionary, ctx) {
  // Is it an apostrophe -S ('s) type.
  let result = regex.exec(str)
  if(result) {
    let owner = result[1]
    let remainder = str.slice(result[0].length).trim()

    return {
      owner: parseNounPhrase(owner, dictionary, ctx),
      remainder: remainder
    }
  }

  // Otherwise, find a possessive pronoun
  let words = str.split(' ')
  let firstWord = words[0]
  if(pronounMap[firstWord])
    return {
      owner: parseNounPhrase(pronounMap[firstWord], dictionary, ctx),
      remainder: words.slice(1).join(' ')
    }

  // Otherwise,
  return null
}
module.exports = parsePossessive

const parseNounPhrase = require('./parseNounPhrase')

},{"./parseNounPhrase":48}],51:[function(require,module,exports){
function parseQuantifier(str, dictionary) {
  let result
  if(/^the(?= |$)/i.test(str))
    return {
      article: 'the',
      definite:true,
      remainder: str.slice(4),
      min: 1,
      max: Infinity,
    }
      else if(result = /^another( |$)/i.exec(str))
        return {
          article: result[0],
          definite: false,
          remainder: str.slice(result[0].length+1),
          min: 1,
          max: 1,
        }
      else if(result = /^(a|an)( |$)/i.exec(str))
        return {
          article: result[0],
          definite: false,
          remainder: str.slice(result[0].length+1),
          min: 1,
          max: 1,
        }
      else if(result = /^[0-9]+( |$)/i.exec(str)) {
        let n = parseInt(result)
        return {
          article: result[0],
          definite: false,
          remainder: str.slice(result[0].length+1),
          min: n,
          max: n,
        }
      }
}
module.exports = parseQuantifier

},{}],52:[function(require,module,exports){
const ParsedSentence = require('./ParsedSentence')

function parseSimpleSentence(str, dictionary, ctx) {
  let result
  for(let syntax of dictionary.predicates.syntaxs) {
    if(result = syntax.parseSentence(str, ctx))
      return result
  }
}
module.exports = parseSimpleSentence

function parseImperative(subject, str, dictionary, ctx) {
  let result
  for(let syntax of dictionary.predicates.syntaxs) {
    if(
      syntax.predicate.actionable
      && (result = syntax.parseImperativeSentence(str, subject, ctx))
    )
      return result
  }
}
module.exports.imperative = parseImperative

},{"./ParsedSentence":40}],53:[function(require,module,exports){
const parseSimpleSentence = require('./parseSentence')

function parseSpecialSentence(str, dictionary, ctx) {
  let result
  for(let syntax of dictionary.specialSentenceSyntaxs)
    if(result = syntax.parseSentence(str, ctx))
      return result

  // Otherwise
  return parseSimpleSentence(str, dictionary, ctx)
}
module.exports = parseSpecialSentence

function parseSpecialImperative(subject, str, dictionary, ctx) {
  let result
  for(let syntax of dictionary.specialSentenceSyntaxs)
    if(result = syntax.parseSentence(str, ctx, subject))
      return result

  // Otherwise
  return parseSimpleSentence.imperative(subject, str, dictionary, ctx)
}
module.exports.imperative = parseSpecialImperative

},{"./parseSentence":52}],54:[function(require,module,exports){
const search = require('./search')
const Sentence = require('./Sentence')


function *parseImperative(str, subject, predicateSet) {
  // parse the string using predicate set
  let interpretations = predicateSet.parseImperative(str, subject)

  // search for matches to the arguments using explore
  for(let interpretation of interpretations) {
    let argOptionsMatrix = []
    let nCombinations = 1
    for(let i=0; i<interpretation.args.length && nCombinations; ++i) {
      let arg = interpretation.args[i]

      // leave literal args alone
      if(interpretation.predicate.params[i].literal)
        argOptionsMatrix[i] = [arg]

      else if(arg.isEntity) // leave args which are already entities alone
        argOptionsMatrix[i] = [arg]

      else if(arg.constructor == String) {
        // try to find a match for the args which are strings
        argOptionsMatrix[i] = []
        for(let match of search(arg, subject))
          argOptionsMatrix[i].push(match)
      }

      nCombinations *= argOptionsMatrix[i].length
    }


    for(let permutation=0; permutation<nCombinations; ++permutation) {
      let args = []
      let p = permutation
      for(let options of argOptionsMatrix) {
        let i = p % options.length
        args.push(options[i])

        p = (p-i) / options.length
      }

      let sentence = new Sentence(interpretation.predicate, args)
      yield sentence
    }
  }
}
module.exports = parseImperative

function parseFirstImperative(str, subject, predicateSet) {
  for(let sentence of parseImperative(str, subject, predicateSet))
    return sentence
  return null
}
module.exports.first = parseFirstImperative

},{"./Sentence":28,"./search":56}],55:[function(require,module,exports){
const Sentence = require('./Sentence')
const {explore} = require('./search')

function randomUncheckedSentence(dictionary, domain) {
  // PRIVATE FUNCTION
  // 1. Choose a predicate that has all non-literal arguments
  let predicates = dictionary.predicates.nonLiteral
  let predicate = predicates[Math.floor(Math.random()*predicates.length)]

  // 2. Choose an entity from the domain for each argument
  let nArgs = predicate.params.length
  let args = []
  for(let i=0; i<nArgs; i++)
    args.push(domain[Math.floor(Math.random()*domain.length)])

  let sentence = new Sentence(predicate, args)

  return sentence
}

function randomSentence(dictionary, domain) {
  // 3. Check if there is a 'problem', if so return to step 1
  if(domain.isEntity)
    domain = [...explore([domain])]

  let sentence
  do {
    if(sentence)
      console.log('discarding:', sentence.str())
    sentence = randomUncheckedSentence(dictionary, domain)
  } while(sentence.getProblems())

  return sentence
}
module.exports = randomSentence

function randomUncheckedImperative(dictionary, subject, domain=subject) {
  if(domain.isEntity)
    domain = [...explore([domain])]

  let predicates = dictionary.predicates.predicates.filter(P => {
    return P.actionable && P.subjectArgIndexs && !P.hasLiterals
  })

  for(let j=0; j<100; j++) {
    let predicate = predicates[Math.floor(Math.random()*predicates.length)]
    let args = []
    for(let i=0; i<predicate.params.length; i++)
      args.push(domain[Math.floor(Math.random()*domain.length)])

    let subjectIndexs = predicate.subjectArgIndexs
    let subjectIndex = subjectIndexs[
      Math.floor(Math.random()*subjectIndexs.length)
    ]

    args[subjectIndex] = subject

    let sentence = new Sentence(predicate, args)
    let problems = sentence.getProblems()
    if(!problems)
      return sentence
    else
      console.log('discarding:', sentence.str())
  }
  return null
}
module.exports.imperative = randomUncheckedImperative

},{"./Sentence":28,"./search":56}],56:[function(require,module,exports){
const getNounPhraselet = require('./util/getNounPhraselet')
const parseOrdinal = require('./util/parseOrdinal')

// search within a given iterator for a entity matching a given string.
function *searchForEntitys(matchStr, domain) {
  // if domain is a entity, use this entity as a starting point for an explore search
  if(domain.isEntity)
    domain = explore([domain])

  domain = [...domain]

  // TRY PUTTING THE ORDINAL SEARCH HERE
  let {phraselet, ordinal} = getNounPhraselet(matchStr)
  if(phraselet && ordinal) {
    let n = parseOrdinal(ordinal)
    if(n)
      for(let e of domain)
        if(e.matchesPhraselet(phraselet)) {
          n--
          if(n == 0) {
            yield e
            return
          }
        }
  }

  for(let entity of domain) {
    if(entity.matches(matchStr))
      yield entity
  }
}

function findFirst(matchStr, domain) {
  for(let entity of searchForEntitys(matchStr, domain))
    return entity

  return null
}

function* explore(startingPoint) {
  let toSearch = startingPoint.slice()
  for(let i=0; i<toSearch.length; i++) {
    yield toSearch[i]
    for(let entity of immediateRelations(toSearch[i]))
      if(!toSearch.includes(entity))
        toSearch.push(entity)
  }
}

function immediateRelations(entity) {
  let list = []
  for(let fact of entity.facts)
    for(let arg of fact.entityArgs)
      if(!list.includes(arg))
        list.push(arg)
  for(let fact of entity.history)
    for(let arg of fact.entityArgs)
      if(!list.includes(arg))
        list.push(arg)
  return list
}


module.exports = searchForEntitys
module.exports.explore = explore
module.exports.first = findFirst
//module.exports.orSpawn = findOrSpawn

},{"./util/getNounPhraselet":64,"./util/parseOrdinal":66}],57:[function(require,module,exports){
const articleReg = /the|a|an|another/
const regOps = require('./util/regOps.js')
const getNounPhraselet = require('./util/getNounPhraselet')

const Entity = require('./Entity')

function spawn(dictionary, str, domain) {
  // spawn a new entity from a noun phrase string

  let phraselet = getNounPhraselet(str)

  // first check all nouns in vanilla form
  for(let noun in dictionary.nouns) {
    let formattedNoun = noun.replace(/_/g, ' ')
    //let reg = new RegExp('^(?:'+articleReg.source + ' ' + noun+')$')
    let reg = regOps.whole(regOps.concatSpaced(articleReg, formattedNoun))
    if(reg.test(str))
      return new Entity(dictionary).be_a(noun)
  }

  // then check the special entity spawners
  for(let spawner of dictionary.entitySpawners) {
    let parsed = spawner.parse(str, domain)
    if(parsed) {
      let e = spawner.construct(...parsed.args)
      if(e)
        return e
    }
  }


}
module.exports = spawn

function randomSpawn(dictionary) {
  let nounKeys = Object.keys(dictionary.nouns)
  let noun = nounKeys[Math.floor(Math.random()*nounKeys.length)]
  return new Entity(dictionary).be_a(noun)
}
module.exports.random = randomSpawn

},{"./Entity":18,"./util/getNounPhraselet":64,"./util/regOps.js":71}],58:[function(require,module,exports){
/** A more flexible version of spawn, allowing quanitifiers and adjectives */

// REQUIRES AT BOTTOM!


/**
 * Create new entities from noun-phrase-strings.
 * @method spawn
 * @param {Dictionary} dictionary
 * @param {String} [...strs] Noun strings
 * @return {Array} An array of entities
 * @throws If unable to parse one of the arguments.
 */
function spawn(dictionary, ...strs) {
  let list = []
  for(let str of strs) {
    let parsed = parseNounPhrase(str, dictionary)
    if(!parsed)
      throw "Unable to spawn: " + str

    let {noun, adjectives, quantityRange} = parsed

    let n = randomInRange(quantityRange)

    for(let i=0; i<n; i++) {
      let entity = new Entity(dictionary)
      entity.be_a(noun)
      for(let adj of adjectives)
        entity.be(adj)

      list.push(entity)
    }
  }

  return list
}
module.exports = spawn


function randomInRange({min, max}) {
  if(max == Infinity) {
    max = min
    while(Math.random() < 0.75)
      max++
  }

  return min + Math.floor(Math.random() * (max-min+1))
}

const parseNounPhrase = require('./util/parseNounPhrase')
const Entity = require('./Entity')

},{"./Entity":18,"./util/parseNounPhrase":65}],59:[function(require,module,exports){
/*
  Substitution is a class for formatting sentence involving zero or more
  args. It can be used to avoid generating the noun phrases until the program
  is sure that they will be needed. A quick function Substitution.substitution
  can be used to format a one off string.
*/

const {randexp} = require("randexp")
const placeholderRegex = /(?:S|O|#|@|L)?_(?:'s)?/g // o = object, s = subject
const {autoBracket, kleenePoliteList} = require("./regOps")
const politeList = require('./politeList')
const toSubject = require('./toSubject')
const toPossessiveAdjective = require('./toPossessiveAdjective')


class Substitution { // sometimes abbreviated Sub
  constructor(templateStr, ...args) {
    this.template = templateStr
    this.args = args

    let placeholderMatches = this.template.match(placeholderRegex)
    if(placeholderMatches)
      this.placeholders = placeholderMatches.map(str => ({
        str: str,
        subject: str[0] == 'S',
        object: str[0] == 'O',
        number: str[0] == '#',
        possessive: /'s$/.test(str),
      }))
    else
      this.placeholders = []
  }

  getString(ctx, options) {
    let toSubIn = this.args.map(o => {
      if(o == null || o == undefined)
        return null
      else if(o.isEntity)
        return o.str(ctx, options)
      else if(o.constructor == String)
        return o
      else if(o.construtor == RegExp)
        return randexp(o)
      else if(o.constructor == Number)
        return o.toString()
      else if(o.isSubstitution)
        return o.getString(ctx, options)
      //else if(o.isAction) // not used in entity-game, only imaginary-city
      //  return o.str()
      else if(o.constructor == Array)
        return o.length ? Substitution.politeList(o).str(ctx, options) : 'nothing'
      else {
        console.warn("Couldn't interpret substitution value:", o, this)
        return "???"
      }
    })

    if(toSubIn.includes(null))
      return null

    return this.subIn(...toSubIn)
  }
  str(ctx, options) {
    // alias for getString
    return this.getString(ctx, options)
  }
  regex(depth) {
    // substitute regular expressions into the template for each arguments
    let toSubIn = this.args.map(o => formatRegex(o, depth))

    if(toSubIn.includes(null))
      return null

    toSubIn = toSubIn.map(autoBracket)
    return new RegExp(this.subIn(...toSubIn))
  }
  getRegex(depth) {
    // alias for backwards compatibility
    return this.regex(depth)
  }

  subIn(...subs) {
    // substitute strings into the template
    for(let i in subs) {
      let placeholder = this.placeholders[i]
      if(placeholder.subject)
        subs[i] = toSubject(subs[i])
      if(placeholder.possessive)
        subs[i] = toPossessiveAdjective(subs[i])
    }

    let bits = this.template.split(placeholderRegex)
    let out = bits[0]
    for(var i=1; i<bits.length; i++)
      out += subs[i-1] + bits[i]
    return out
  }

  static substitute(templateStr, ...args) {
    let ctx
    if(!args[args.length-1].isEntityenon)
      ctx = args.pop()
    else
      ctx = {}

    return new Substitution(templateStr, ...args).getString(ctx)
  }

  static politeList(items) {
    let placeholders = items.map(item => '_')
    let template = politeList(placeholders)
    return new Substitution(template, ...items)
  }

  static concat(...toConcat) {
    // concatenate many substitutions and strings into a new substitution
    let strs = []
    let args = []

    for(let bit of toConcat) {
      if(bit.constructor == String)
        strs.push(bit)
      if(bit.constructor == Substitution) {
        strs.push(bit.template)
        args = args.concat(bit.args)
      }
    }

    let template = strs.join('')
    return new Substitution(template, ...args)
  }

  static sub(...args) {
    return new Substitution(...args)
  }
}

Substitution.prototype.isSubstitution = true
Substitution.placeholderRegex = placeholderRegex
module.exports = Substitution

const formatRegex = (o, depth) => {
  if(o == null || o == undefined)
    return o
  else if(o.isEntity)
    return o.reg(depth).source
  else if(o.constructor == String)
    return o
  else if(o.constructor == RegExp)
    return autoBracket(o.source)
  else if(o.constructor == Number)
    return o.toString()
  else if(o.constructor == Array) {
    //throw "cannot (yet) generate regex from substitution containing an array"
    return kleenePoliteList(...o.map(formatRegex)).source
  } else if(o.isSubstitution) {
    let regex = o.getRegex()
    if(regex && regex.constructor == RegExp)
      return autoBracket(regex.source)
    else return null
  } else {
    console.warn("Couldn't interpret substitution value:", o)
    return "???"
  }
}

},{"./politeList":70,"./regOps":71,"./toPossessiveAdjective":75,"./toSubject":76,"randexp":8}],60:[function(require,module,exports){
/*
  Given the infinitive form of a verb and a person/verbform number (0-8) return
  the conjugated verb form.
*/

/*
VERB FORMS DENOTED AS NUMBERS:
  0.  infinitive
  1.  first person singular
  2.  second person singular
  3.  third person singular
  4.  first person plural
  5.  second person plural
  6.  third person plural
  (7.  gerund/present-participle)
  (8.  past-participle)
  (9. past tense form)
*/

const regOp = require("../regOps")
const irregular = require("./irregularConjugations")

const endsWithShortConsonant = /[aeiou][tpdn]$/
const endsWithE = /e$/
const endsWithOOrX = /[oxzs]$/

const FIRST_PERSON_SINGULAR = 1   // I
const SECOND_PERSON_SINGULAR = 2  // you
const THIRD_PERSON_SINGULAR = 3   // he/she/it
const FIRST_PERSON_PLURAL = 4     // we
const SECOND_PERSON_PLURAL = 5    // you
const THIRD_PERSON_PLURAL = 6     // they
const GERUND = 7
const PAST_PARTICIPLE = 8
const PAST_TENSE = 9
const ALL_PERSON_REGEX = 10

function conjugate(infinitive, form) {
  let words = infinitive.split(' ')
  infinitive = words[0]

  let conjugated
  if(form == ALL_PERSON_REGEX)
    conjugated = anyPersonRegex(infinitive)
  if(irregular[infinitive] && irregular[infinitive][form])
    conjugated = irregular[infinitive][form]
  else
    conjugated = conjugateRegular(infinitive, form)

  words[0] = conjugated
  return words.join(' ')
}

function conjugateRegular(infinitive, form) {
  switch(form) {
    // third person singular
    case THIRD_PERSON_SINGULAR:
      if(endsWithOOrX.test(infinitive))
        return infinitive+'es'
      else
        return infinitive+'s'

    // gerund
    case GERUND:
      if(endsWithE.test(infinitive))
        return infinitive.slice(0, infinitive.length-1)+'ing'
      if(endsWithShortConsonant.test(infinitive))
        return infinitive + infinitive[infinitive.length-1]+'ing'
      return infinitive+'ing'

    // past participle
    case PAST_TENSE:
    case PAST_PARTICIPLE:
      if(endsWithShortConsonant.test(infinitive))
        return infinitive + infinitive[infinitive.length-1]+'ed'
      if(endsWithE.test(infinitive))
        return infinitive+'d'
      else
        return infinitive+'ed';

    default:
      return infinitive
  }
}

function anyPersonRegex(infinitive) {
  let forms = []
  for(let person=1; person<=6; ++person) {
    let form = conjugate(infinitive, person)
    if(!forms.includes(form))
      forms.push(form)
  }
  return regOp.or(...forms)
}


module.exports = conjugate
conjugate.anyPersonRegex

},{"../regOps":71,"./irregularConjugations":62}],61:[function(require,module,exports){
// Determine the numeric person of a given noun phrase

/*
VERB FORMS DENOTED AS NUMBERS:
  0.  infinitive
  1.  first person singular
  2.  second person singular
  3.  third person singular
  4.  first person plural
  5.  second person plural
  6.  third person plural
  (7. gerund/present-participle)
  (8. past-participle)
  (9. past tense form)
*/

const {placeholderRegex} = require("../Substitution")
const placeholderTest = new RegExp('^'+placeholderRegex.source+'$', '')

function getPerson(subject) {
  // if subject is not a string, assume third person for now
  if(subject && subject.constructor != String)
    return 3

  let lowerCaseSubject = subject.toLowerCase()

  if(lowerCaseSubject == 'i')
    return 1 // first person singular

  else if(lowerCaseSubject == 'you')
    return 2 // or 5 but never mind

  else if((/^(he|she|it)$/i).test(subject))
    return 3 // third person singular

  else if(lowerCaseSubject == 'we')
    return 4 // first person plural

  else if(lowerCaseSubject == 'they')
    return 6 // third person plural

  else if(subject.constructor == RegExp || placeholderTest.test(subject))
    return 10 // placeholder, get regex

  else // otherwise assume third person
    return 3

  // TODO, what about third person plural non pronouns!
}
module.exports = getPerson

},{"../Substitution":59}],62:[function(require,module,exports){
// list of irregular verbs with their conjugations.
// (indexed by infinitive)

/*
VERB FORMS DENOTED AS NUMBERS:
  0.  infinitive
  1.  first person singular
  2.  second person singular
  3.  third person singular
  4.  first person plural
  5.  second person plural
  6.  third person plural
  (7.  gerund/present-participle)
  (8.  past-participle)
  (9. past tense form)
*/

const FIRST_PERSON_SINGULAR = 1   // I
const SECOND_PERSON_SINGULAR = 2  // you
const THIRD_PERSON_SINGULAR = 3   // he/she/it
const FIRST_PERSON_PLURAL = 4     // we
const SECOND_PERSON_PLURAL = 5    // you
const THIRD_PERSON_PLURAL = 6     // they
const GERUND = 7
const PAST_PARTICIPLE = 8
const PAST_TENSE = 9
const ALL_PERSON_REGEX = 10

module.exports = {
  // be IS THIS EVEN A VERB?
  be: {
    1: 'am', 2:'are', 3:'is', 4:'are', 5:'are', 6:'are', 7:'being', 8:'been',
    9:'was',
  },

  say: {8:'said', 9:'said'},

  make: {8: 'made', 9: 'made'},
  go:   {8: 'gone', 9: 'went'},
  take: {8: 'taken',9: 'took'},
  come: {8: 'come', 9: 'came'},
  see: {7: 'seeing', 8:'seen', 9:'saw'},
  know: {8: 'known', 9:'knew'},
  get: {8:'got', 9:'got'},
  run: {8:'run', 9:'ran'},
  were: {1:'was', 3:'was'}, // this is a cludge and i know it
  have: {3:'has', 8:'had', 9:"had"},
  eat: {7:'eating', 8:'eaten', 9:'ate'},
  contain: {7:'containing', 8:'contained', 9:'contained'},
  hold: {8:'held', 9:'held'},
  put: {8:'put', 9:'put'},
  poop: {7:'pooping', 8:'pooped', 9:'pooped'},
  steal: {7:'stealing', 8:'stolen', 9:'stole'},
  lead: {7:'leading', 8:'lead', 9:'lead'},
  lie: {7:'lying', 8:'lay', 9:'lay'},
  sleep: {7:'sleeping', 8:'slept', 9:'slept'}
  // give
  // find
  // think
  // tell
  // become
  // show
  // leave
  // feel
  // bring
  // begin
  // keep
  // write
  // stand
  // hear
  // let
  // mean
  // set
  // meet
  // pay
  // sit
  // speak
  // lie
  // lead
  // read
  // grow
  // lose
  // fall
  // send
  // build
  // understood
  // draw
  // break
  // spend
  // cut
  // rise
  // drive
  // buy
  // wear
  // choose

  // to shit

}

},{}],63:[function(require,module,exports){
/*
Tenses: [source ef.co.uk]
  - Simple Present ("They walk home.")
  - Present Continuous ("They are walking home.")
  - Simple Past ("Peter lived in China in 1965")
  - Past Continuous ("I was reading when she arrived.")
  - Present Perfect ("I have lived here since 1987.")
  - Present Perfect Continuous ("I have been living here for years.")
  - Past Perfect ("We had been to see her several times before she visited us")
  - Past Perfect continuous ("He had been watching her for some time when she
    turned and smiled.")
  - Future Perfect ("We will have arrived in the states by the time you get this
    letter.")
  - Future Perfect Continuous ("By the end of your course, you will have been
    studying for five years")
  - Simple Future ("They will go to Italy next week.")
  - Future Continuous ("I will be travelling by train.")


  (Maybe also include:
  - Zero conditional ("If ice gets hot it melts.")
  - Type 1 Conditional ("If he is late I will be angry.")
  - Type 2 Conditional ("If he was in Australia he would be getting up now.")
  - Type 3 Conditional ("She would have visited me if she had had time")
  - Mixed Conditional ("I would be playing tennis if I hadn't broken my arm.")
  - Gerund
  - Present participle)
*/

const conjugate = require("./conjugate")
const getPerson = require("./getPerson")
const {sub} = require('../Substitution')
//const Substitution = require("../Substitution")
const regOps = require("../regOps")

const GERUND = 7
const PAST_PARTICIPLE = 8
const PAST_TENSE = 9

const actionReservedWords = ['_verb', '_object', '_subject']

function verbPhrase(
  action,
  tense='simple_present',
  {
    omit=null,
    nounPhraseFor=null,
    prepositionClauseFor=null
  } = {}
) {
  if(prepositionClauseFor)
    return sub('that _', verbPhrase(
      action, tense, {omit: prepositionClauseFor}
    ))

  if(nounPhraseFor) {
    return sub(
      '_ that _',
      action[nounPhraseFor],
      verbPhrase(action, tense, {omit: nounPhraseFor}))
  }

  let vp = tenses[tense](action)

  if(action._object && omit != '_object')
    vp = sub("_ O_", vp, action._object)

  for(var prep in action) {
    if(!actionReservedWords.includes(prep))
      if(omit == prep)
        vp = sub('_ _', vp, prep)
      else
        vp = sub('_ _ _', vp, prep, action[prep])
  }

  if(omit != '_subject' && tense != 'imperative')
    vp = sub('S_ _', action._subject, vp)

  return vp
}

function contractBySubject(actions, tense) {
  // format a set of actions as a contracted phrases sharing the same subject

  // first check that the subjects match
  let subject = actions[0]._subject
  for(let action of actions)
    if(action._subject != subject)
      throw "cannot perform contraction because the subjects do not match"

  return sub(
    '_ _', subject,
    actions.map(action => verbPhrase(action, tense, {omit:['_subject']}))
  )
}

function anyTenseRegex(verb) {
  let action = {_verb:verb, _subject:'_subject'}
  let forms = []
  for(var i in tenses) {
    let form = tenses[i](action)
    if(form.isSubstitution)
      form = form.getRegex()
    forms.push(form)
  }

  return regOps.or(...forms)
}

const tenses = {
  simple_present(action) {
    let person = getPerson(action._subject)
    return sub(
      "_",
      conjugate(action._verb, person)
    )
  },

  present_continuous(action) {
    let person = getPerson(action._subject)
    return sub(
      "_ _",
      conjugate('be', person),
      conjugate(action._verb, GERUND)
    )
  },

  simple_past(action) {
    let person = getPerson(action._subject)
    return sub(
      '_',
      conjugate(action._verb, PAST_TENSE)
    )
  },

  past_continuous(action) {
    let person = getPerson(action._subject)
    return sub(
      '_ _',
      conjugate('were', person),
      conjugate(action._verb, GERUND)
    )
  },

  present_perfect(action) {
    let person = getPerson(action._subject)
    return sub(
      '_ _',
      conjugate('have', person),
      conjugate(action._verb, PAST_PARTICIPLE)
    )
  },

  present_perfect_continuous(action) {
    let person = getPerson(action._subject)
    return sub(
      '_ been _',
      conjugate('have', person),
      conjugate(action._verb, GERUND)
    )
  },

  past_perfect(action) {
    let person = getPerson(action._subject)
    return sub(
      '_ _',
      conjugate('have', person),
      conjugate(action._verb, PAST_PARTICIPLE)
    )
  },

  past_perfect_continuous(action) {
    return sub(
      'had been _',
      conjugate(action._verb, GERUND)
    )
  },

  future_perfect(action) { // we will have verbed
    return sub(
      'will have _',
      conjugate(action._verb, PAST_PARTICIPLE)
    )
  },

  // Future Perfect Continuous ("you will have been studying for five years")
  future_perfect_continuous(action) {
    return sub(
      'will have been _',
      conjugate(action._verb, GERUND)
    )
  },

  // Simple Future ("They will go to Italy next week.")
  simple_future(action) {
    return sub(
      'will _',
      action._verb,
    )
  },

  // Future Continuous ("I will be travelling by train.")
  future_continuous({_subject, _verb}) {
    return sub(
      'will be _',
      conjugate(_verb, GERUND)
    )
  },

  imperative({_verb}) {
    return sub(_verb)
  },

  possible_present({_subject, _verb}) {
    return sub('can _', _verb)
  },

  possible_past({_subject, _verb}) {
    return sub('could _', _verb)
  },

  negative_possible_present({_subject, _verb}) {
    return sub('cannot _', _verb)
  },
  negative_possible_past({_subject, _verb}) {
    return sub('could not _', _verb)
  },
}

function tenseType(tense) {
  if(tense.includes('past'))
    return 'past'
  else if(tense.includes('present'))
    return 'present'
  else if(tense.includes('future'))
    return 'future'
  else
    return undefined
}

module.exports = verbPhrase
verbPhrase.contractBySubject = contractBySubject
verbPhrase.tenses = tenses
verbPhrase.tenseList = Object.keys(tenses).reverse() // in descending order of complexity
verbPhrase.anyTenseRegex = anyTenseRegex
verbPhrase.getTenseType = tenseType

},{"../Substitution":59,"../regOps":71,"./conjugate":60,"./getPerson":61}],64:[function(require,module,exports){
const ordinal = require('integer-to-ordinal-english')
const regops = require('./regOps')


const articleRegex = regops.capture(
  /a|an|another|the/,
  'article'
)
const ordinalRegex = regops.capture(
  regops.or(
    /[0-9]+(?:st|nd|rd|th)/,
    /(?:\w+-)*(?:first|second|third|(?:\w+th))/),
  'ordinal'
)

const nounPhraseRegex = regops.whole(regops.concatSpaced(
  regops.optionalConcatSpaced(articleRegex, ordinalRegex),
  /(?<phraselet>.+)/
))


function getNounPhraselet(str) {
  let result = nounPhraseRegex.exec(str)
  if(result)
    return result.groups
  else if(/^[A-Z]/)
    return {
      properNoun: str
    }
}
module.exports = getNounPhraselet

},{"./regOps":71,"integer-to-ordinal-english":7}],65:[function(require,module,exports){
const Plur = require('./plural')
const parseQuantifier = require('./parseQuantifier')

/**
 * Parse a noun-phrase without embedded sentence clauses. Noun-phrases must be
 * in the form: [quantifier] + [...adjectives] + [noun].
 * @method
 */
function parseNounPhrase(str, dictionary) {
  let noun = null
  let plural = undefined

  // check phrasal nouns
  let remainder
  for(let nounObject of dictionary.phrasalNouns) {
    let singularNoun = nounObject.singular
    if(nounObject.regexTerminating.test(str)) {
      noun = singularNoun
      plural = false
      remainder = str.slice(0, -singularNoun.length).trim()
      break;
    }


    let pluralNoun = nounObject.plural
    if(nounObject.pluralRegexTerminating.test(str)) {
      noun = singularNoun
      plural = true
      remainder = str.slice(0, -pluralNoun.length).trim()
      break;
    }
  }

  // Unless phrasal noun was successful, check the last word against regular
  // nouns.
  if(remainder == undefined) {
    // parse last word as singular
    let lastWord = str.slice((str.lastIndexOf(' ') + 1))
    if(dictionary.nouns[lastWord]) {
      noun = lastWord
      plural = false
      remainder = str.slice(0, -lastWord.length).trim()
    } else{
      // parse last word as a plural
      let lastWordSingular = Plur.toSingular(lastWord)
      if(lastWordSingular && dictionary.nouns[lastWordSingular]) {
        noun = lastWordSingular
        plural = true
        remainder = str.slice(0, -lastWord.length).trim()
      }
    }
  }

  // exit early if failed to identify a noun
  if(!noun)
    return null

  // parse quantifier/quantity
  let quantity = plural ? {min:2, max:Infinity} : {min:1, max:1}
  let quantifier = parseQuantifier(remainder)
  if(quantifier) {
    quantity = rangeOverlap(quantity, quantifier)
    remainder = remainder.slice(quantifier.str.length).trim()
  } else {
    console.warn('expected quantifier')
    return null
  }

  if(quantity.min > quantity.max)
    return null

  // treat the remaining words as adjectives
  let adjectives = remainder.split(' ').filter(adj => adj.length)
  if(!adjectives.every(adj => dictionary.adjectives[adj]))
    return null

  return {
    noun: noun,
    plural: plural,
    quantityRange: quantity,
    adjectives: adjectives,
  }
}
module.exports = parseNounPhrase

/**
 * Calculate a new range which is the intersection of two given ranges.
 * @method rangeOverlap
 * @param range1
 * @param range1.min
 * @param range1.max
 * @param range2.min
 * @param range2.max
 * @return {Object} A new range {Min, Max}
 */
function rangeOverlap(range1, range2) {
  return {
    min: Math.max(range1.min, range2.min),
    max: Math.min(range1.max, range2.max)
  }
}

},{"./parseQuantifier":67,"./plural":69}],66:[function(require,module,exports){
const ordinal = require('integer-to-ordinal-english')

const LIMIT = 100

function parseOrdinal(str) {
  let n = parseInt(str)
  if(!isNaN(n))
    return n

  str = str.toLowerCase()

  for(let i=1; i<LIMIT; i++) {
    if(ordinal(i).toLowerCase() == str)
      return i
  }
}
module.exports = parseOrdinal

},{"integer-to-ordinal-english":7}],67:[function(require,module,exports){
/**
 * Parse a quantifier word/phrase as a range of possible meanings
 * @method parseQuantifier
 * @param {String} str The quantifier
 * @return {Object} {min, max}
 */
function parseQuantifier(str) {
  let r // result, a temporary variable, reused many times

  // a few
  r = getWord(/a few|some/i, str)
  if(r)
    return {min: 2, max:5, definite:false, str:r[0]}

  // indefinite article
  r = getWord(/a|an/i, str)
  if(r)
    return {min:1, max:1, definite:false, str:r[0]}

  // definite article
  if(getWord(/the/i, str))
    return {min:1, max:Infinity, definite:true, str:'the'}

  // number
  r = getWord(/\d+/, str)
  if(r) {
    let n = parseInt(r[0])
    if(!isNaN(n))
      return {min: n, max:n, str:r[0]}
  }

  // approximate number
  r = getWord(/(?:approximately|around|about) (?<n>\d+)/i, str)
  if(r) {
    let n = parseInt(r[1])
    if(!isNaN(n))
      return {
        min: Math.floor(0.75 * n),
        max: Math.ceil(n / 0.75),
        str: r[0]
      }
  }

  return null
}
module.exports = parseQuantifier

function getWord(wordReg, str) {
  if(wordReg instanceof RegExp)
    wordReg = wordReg.source
  let reg = new RegExp('^(?:'+wordReg+')(?= |$)')
  let result = reg.exec(str)
  if(result) {
    return result
  } else
    return null
}

},{}],68:[function(require,module,exports){
/*
  Borrowed from NULP, https://github.com/joelyjoel/Nulp/
  Seperate words, punctuation and capitalisation. Form an array which is easier
  to process.
*/


const wordCharRegex = /[\w'-]/;
const punctuationCharRegex = /[.,"()!?-]/;

module.exports = parseText = function(str) {
    // seperates a string into a list of words and punctuation

    str = removeFancyShit(str);

    var parts = new Array();

    var c, lastC;

    var partType = undefined;
    parts[0] = "";
    for(var i=0; i<str.length; i++) {
        //lastC = c;
        c = str.charAt(i);

        if(c == "_") {
            if(partType == undefined)
                partType = "q";
            else if(partType == "punctuation") {
                partType = "q";
                parts.push("");
            }
        }
        if(partType == "q") {
            if(c == " " || c == "\n" || c == "\t") {
                parts.push("");
                partType = undefined;
                continue;
            } else {
                parts[parts.length-1] += c;
                continue;
            }
        }

        if(c == "\n") {
            if(partType == "punctuation")
                parts[parts.length-1] += c;
            else
                parts.push(c);

            parts.push("");
            partType = undefined;
            continue;
        }

        if(c == " " && parts[parts.length-1] != "") {
            parts.push("");
            partType = undefined
            continue;
        }

        // special punctuation (hyphens and apostrophes)
        if(c == "'") {
            if(partType == "word" && (str.charAt(i+1).match(wordCharRegex) || str.charAt(i-1) == "s")) {
                parts[parts.length-1] += c;
                continue;
            }
        }

        if(c == "-") {
            if(str.charAt(i-1) == " " && str.charAt(i+1) == " ") {
                parts[parts.length-1] += "~";
                continue;
            }
        }

        // word
        if(c.match(wordCharRegex)) {
            if(partType == undefined) {
                partType = "word";
            }
            if(partType != "word") {
                parts.push("");
                partType = "word";
            }
            parts[parts.length-1] += c;
            continue;
        }

        //if(c.match(punctuationCharRegex)) {
        else {
            /*if(partType == undefined) {
                partType = "punctuation";
            }
            if(partType != "punctuation") {
                parts.push("");
                partType = "punctuation";
            }
            parts[parts.length-1] += c;*/
            parts.push(c);
            partType = "punctuation";
            continue;
        }

        console.warn("Unrecognised character", c);
    }
    for(var i=0; i<parts.length; i++) {
        if(parts[i] == "")
            continue;
        if(parts[i][0].match(/[A-Z]/) && parts[i].slice(1).match(/[a-z]/)) {
            parts[i] = parts[i].toLowerCase();
            parts.splice(i, 0, "^");
            i++;
        }
    }

    return parts;
}

function isWord(str) {
  var c
  for(var i in str) {
    c = str[i]
    if(!c.match(wordCharRegex))
      return false
  }
  return true
}
module.exports.isWord = isWord

function removeFancyShit(str) {
    while(str.indexOf("’") != -1) {
        str = str.replace("’", "\'")
    }

    return str;
}

function recombine(bits) {
    var printedWords = []
    var upper = false
    for(var i in bits) {
        let w = bits[i]
        if(isWord(w)) {
            if(upper) {
                w = w[0].toUpperCase() + w.slice(1)
                upper = false;
            }
            printedWords.push(w)
        } else {
            if(w == "^") {
                upper = true;
                continue;
            }
            printedWords[printedWords.length-1] += w;
        }
    }
    return printedWords.join(" ")
}
module.exports.recombine = recombine

},{}],69:[function(require,module,exports){
/**
 * Convert english nouns between their singular and plural forms.
 * @class plural
 * @static
 */

/**
 * Convert a singular noun to a plural.
 * @method toPlural
 * @param {String} singularNoun
 * @return {String}
 */
function toPlural(singularNoun) {
  // if irregular return the irregular plural
  if(irregular[singularNoun])
    return irregular[singularNoun]

  // If the singular noun ends in -o, ‑s, -ss, -sh, -ch, -x, or -z, add ‑es
  if(/(o|s|ss|sh|ch|x|z)$/i.test(singularNoun))
    return singularNoun + 'es'

  // If the noun ends with ‑f or ‑fe, the f is often changed to ‑ve before
  // adding the -s to form the plural version.
  // -- FOR NOW, TREATING THESE AS IRREGULAR.

  // If a singular noun ends in ‑y and the letter before the -y is a consonant,
  // change the ending to ‑ies to make the noun plural.
  if(/[bcdfghjklmnpqrstvwxyz]y$/i.test(singularNoun))
    return singularNoun.slice(0, -1) + 'ies'

  // If the singular noun ends in ‑us, the plural ending is frequently ‑i.
  if(/us$/.test(singularNoun))
    return singularNoun.slice(0, -1) + 'i'

  // If the singular noun ends in ‑is, the plural ending is ‑es.
  // -- IGNORING BECAUSE HARD IT INTRODUCES AMBIGUITY IN INVERSION. TREATING
  //    THESE WORDS AS IRREGULAR.

  // If the singular noun ends in ‑on, the plural ending is ‑a.
  if(/on$/.test(singularNoun))
    return singularNoun.slice(0, -2) + 'a'

  // otherwise add -s on the end
  return singularNoun+'s'
}

/**
  * Convert a plural noun to a singular
  * @method toSingular
  * @param {String} pluralNoun
  * @return {String|null}
  */
function toSingular(pluralNoun) {
  // If irregular, replace with the singular
  if(irregularInverted[pluralNoun])
    return irregularInverted[pluralNoun]

  // If the plural noun ends -ies, replace with -y
  if(/ies$/.test(pluralNoun))
    return pluralNoun.slice(0, -3) + 'y'

  // If the plural noun ends with a consonant followed by -les, remove -s
  if(/[bcdfghjklmnpqrstvwxyz]les$/.test(pluralNoun))
    return pluralNoun.slice(0, -1)

  // If the plural noun ends with a vowell followed by a consonant followed by
  // -es, remove -s
  if(/[aeiou][bcdfghjklmnpqrstvwxyz]es$/.test(pluralNoun))
    return pluralNoun.slice(0, -1)

  // If the plural noun ends -es, remove -es
  if(/es$/.test(pluralNoun))
    return pluralNoun.slice(0, -2)

  // If the plural noun ends -s, remove -s
  if(/s$/.test(pluralNoun))
    return pluralNoun.slice(0, -1)

  // If the plural noun ends -i, replace with -us
  if(/i$/.test(pluralNoun))
    return pluralNoun.slice(0, -1) + 'us'

  // If the plural noun ends -a, replace with -on
  if(/a$/.test(pluralNoun))
    return pluralNoun.slice(0, -1) + 'on'

  // If the plural noun ends -s, remove -s
  if(/s$/.test(pluralNoun))
    return pluralNoun.slice(0, -1)

  // Otherwise return null, this is recognised as a plural noun
  return null
}

module.exports = {
  toPlural: toPlural,
  toSingular: toSingular,
}

const irregular = {
  // singular : plural,
  sheep: 'sheep',
  ice: 'ice',

  goose: 'geese',
  child: 'children',
  woman: 'women',
  man: 'men',
  tooth: 'teeth',
  foot: 'feet',
  mouse: 'mice',
  person: 'people',

  toe: 'toes',

  // phrasal nouns
  'pair of trousers': 'pairs of trousers',
}

const irregularInverted = {}
for(let singular in irregular) {
  let plural = irregular[singular]
  irregularInverted[plural] = singular
}

},{}],70:[function(require,module,exports){
function politeList(list) {
  if(list.length == 1)
    return list[0]
  else {
    return list.slice(0, list.length-1).join(", ") + " and " + list[list.length-1]
  }
}
module.exports = politeList

function parsePoliteList(str) {
  //result = /^([A-Z ]+)(?:(?:, (.+))* and (.+))$/i.exec(str)
  result = /^(?:(?:(.+), )*(.+) and )(.+)$/.exec(str)

  if(result)
    return result.slice(1).filter(o=>o)
}
module.exports.parse = parsePoliteList

},{}],71:[function(require,module,exports){
function sourcify(list) {
  return list
    .filter(item => item)
    .map(item => item.constructor == RegExp ? item.source : item)
}

function bracket(str) {
  return "(?:" + str + ")"
}
function autoBracket(str) {
  if(/^[\w, ]*$/.test(str))
    return str
  else
    return bracket(str)
}

function concat(...operands) {
  return new RegExp(
    sourcify(operands)
      .map(autoBracket)
      .join("")
  )
}
function concatSpaced(...operands) {
  return new RegExp(
    sourcify(operands)
      .map(autoBracket)
      .join(" ")
  )
}
function or(...operands) {
  return new RegExp(
    sourcify(operands)
      .map(autoBracket)
      .join("|")
  )
}
function optional(operand) {
  operand = new RegExp(operand).source
  operand = bracket(operand)
  return operand + "?"
}
function kleene(operand) {
  operand = new RegExp(operand).source
  operand = bracket(operand)
  return operand + "*"
}

function kleeneSpaced(operand) {
  return kleeneJoin(operand, ' ')
}

function kleeneJoin(operand, seperator) {
  operand = new RegExp(operand).source
  seperator = new RegExp(seperator).source
  return concat(operand, kleene(concat(seperator, operand)))
}

function kleenePoliteList(...operands) {
  operand = or(...operands)
  return concat(
    optional(concat(kleeneJoin(operand,', '), ',? and ')),
    operand
  )
}

function optionalConcatSpaced(stem, ...optionalAppendages) {
  stem = autoBracket(new RegExp(stem).source)
  optionalAppendages = sourcify(optionalAppendages)
    .map(a => autoBracket(a))
    .map(a => optional(" " + a))
  return concat(stem, ...optionalAppendages)
}

function kleeneConcatSpaced(stem, ...optionalAppendages) {
  stem = autoBracket(new RegExp(stem).source)
  optionalAppendages = sourcify(optionalAppendages)

  let toConcat = kleene(concat(' ', or(...optionalAppendages).source))
  return concat(stem, toConcat)
}

function whole(operand) {
  operand = autoBracket(new RegExp(operand).source)
  return new RegExp('^'+operand+'$')
}

function capture(operand, groupName) {
  if(operand.constructor == RegExp)
    operand = operand.source

  let name = groupName ? '?<'+groupName+'>' : ''

  return new RegExp('(' + name + operand + ')')
}

module.exports = {
  concat: concat,
  concatSpaced: concatSpaced,
  or: or,
  optional: optional,
  kleene: kleene,
  kleeneJoin: kleeneJoin,
  kleeneSpaced: kleeneSpaced,
  kleenePoliteList: kleenePoliteList,
  kleeneConcatSpaced: kleeneConcatSpaced,
  optionalConcatSpaced: optionalConcatSpaced,
  autoBracket: autoBracket,
  whole: whole,
  capture: capture,
}

},{}],72:[function(require,module,exports){
arguments[4][71][0].apply(exports,arguments)
},{"dup":71}],73:[function(require,module,exports){
/*
  A set of tools for using the so-called 'special array', or 'specarr'.

  Special Arrays consist of:
  [
    - null values to ignore
    - strings
    - Regexs
    - Entityena
    - substitutions
    - functions returning:
      - null values to ignore
      - strings
      - regexs
      - entityena
      - substitutions
      - special arrays for recursion
  ]

  Fully expanded special arrays consist of:
  [
    - strings,
    - regexs,
    - entityena,
    - substitutions
    - NO FUNCTIONS AND NO NULL VALUES
  ]

  Note: I in the function names in this file I am using an underscore to mean
        'to'. Eg/ specarr_regexs means "Special array to regular expressions"
*/

const {randexp} = require("randexp")

function specarr_regexs(target, specialArr, depth) { // special array to regexps
  // convert a 'special array' into an array of strings and regular expressions
  if(!target || (!target.isEntityenon && !target.isEntity))
    throw "expects target to be a Entityenon. "+target
  if(!specialArr || specialArr.constructor != Array)
    throw "expects specialArr to be an array."

  var out = [] // the output array
  for(var i in specialArr) {
    let item = specialArr[i]

    if(!item) // skip null values
      continue

    else if(item.constructor == String) // accept strings as regexs
      out.push(new RegExp(item))

    else if(item.constructor == RegExp) // accept regular expressions
      out.push(item)

    else if(item.isEntityenon)
      out.push(item.refRegex())
    else if(item.isEntity)
      out.push(item.reg(depth))

    // if substitution, interpret the substitution as a regex and add
    else if(item.isSubstitution) {
      //console.warn("Very odd, a substitution that is not returned by a function")
      let subbed = item.getRegex(depth)
      if(subbed)
        out.push(subbed)
    }

    else if(item.constructor == Function) {
      // call function on the target
      let result = item(target)

      // if result is null, skip.
      if(!result)
        continue;
      // accept result if RegExp
      else if(result.constructor == RegExp)
        out.push(result)
      // if string cast as RegExp and accept
      else if(result.constructor == String)
        out.push(new RegExp(result))
      // if substitution, interpret the substitution as a regex and add
      else if(result.isSubstitution) {
        let subbed = result.getRegex(depth)
        if(subbed)
          out.push(subbed)
      }
      // if entityenon, return its regex
      else if(result.isEntityenon)
        out.push(result.refRegex())
      else if(result.isEntity)
        out.push(result.reg(depth))
      // if array, recursively interpret and concatenate the result
      else if(result.constructor == Array)
        out = out.concat(specarr_regexs(target, result))
      else
        console.warn("Uninterpretted value from function:", result)
    } else
      console.warn("Uninterpretted value from list:", item)
  }

  // perhaps remove duplicates?
  for(var i in out) {
    if(out[i].constructor != RegExp)
      console.warn("specarr_regexs returned item which is not a regex:", out[i])
  }

  return out
}

function expand(target, specialArr) {
  /* Return the list of strings, regexs, objects and substitutions implied by
      the special array. */
  if(!target || !(target.isEntityenon || target.isEntity))
    throw "expects target to be a Entityenon."
  if(!specialArr || specialArr.constructor != Array)
    throw "expects specialArr to be an array."

  let out = []
  for(var i in specialArr) {
    let item = specialArr[i]
    if(!item) // skip null values
      continue

    else if(item.constructor == String) // accept strings
      out.push(item)

    else if(item.constructor == RegExp) // accept regular expressions
      out.push(item)

    else if(item.isSubstitution) // accept substitutions
      out.push(item)

    else if(item.isEntityenon || item.isEntity) // accept entityenon
      out.push(item)

    else if(item.isAction) // accept actions
      out.push(item)

    else if(typeof item == 'object' && item._verb) // accept rough actions
      out.push(item)

    // execute functions
    else if(item.constructor == Function) {
      let result = item(target)

      if(!result) // skip null function returns
        continue

      else if(result.constructor == RegExp) // accept regex function returns
        out.push(result)

      else if(result.constructor == String) // accept strings
        out.push(result)

      else if(result.isSubstitution) // accept substitutions
        out.push(result)

      else if(result.isEntityenon || item.isEntity) // accept entityena
        out.push(result)

      else if(result.isAction) // accept actions
        out.push(result)

      else if(typeof result == 'object' && result._verb) // accept rough actions
        out.push(result)

      else if(result.constructor == Array)
        out = out.concat(expand(target, result))
      else
        console.warn("Uninterpretted value from function:", result)
    } else
      console.warn("Uninterpretted value from list:", item)
  }

  return out
}

function cellToString(cell, descriptionCtx) { // "special array cell to string"
  // get a finalised string for an expanded special arr cell

  // if null or function, throw an error
  if(!cell || cell.constructor == Function)
    throw "illegal special cell."

  // if string, return as is
  if(cell.constructor == String)
    return cell
  // if regex, return using randexp
  if(cell.constructor == RegExp)
    return randexp(cell)
  // if entityenon, get its ref
  if(cell.isEntityenon)
    return cell.ref(descriptionCtx)
  if(cell.isEntity)
    return cell.ref()
  // if substitution, get its string
  if(cell.isSubstitution)
    return cell.getString(descriptionCtx)
}

// TODO: cellToRegex

function randomString(target, arr, ctx) {
  let expanded = expand(target, arr).sort(() => Math.random()*2-1)
  for(var i=0; i<expanded.length; i++) {
    let str = cellToString(expanded[i], ctx)
    if(str)
      return str
  }
  return null
}

function randomStrings(target, arr, ctx, n=1) {
  let expanded = expand(target, arr).sort(() => Math.random()*2-1)
  let list = []
  for(var i=0; i<expanded.length && list.length < n; i++) {
    let str = cellToString(expanded[i], ctx)
    if(str)
      list.push(str)
  }
  return list
}

function random(target, arr) {
  let expanded = expand(target, arr)
  return expanded[Math.floor(Math.random()*expanded.length)]
}


module.exports = {
  toRegexs: specarr_regexs,
  expand: expand,
  cellToString: cellToString,
  randomString: randomString,
  randomStrings: randomStrings,
  random: random,
}

},{"randexp":8}],74:[function(require,module,exports){
const parseText = require("./parseText")

function spellcheck(str) {
  // correct the indefinite articles
  let reg = /(?<=^| )a?(?= [aeiou])/ig
  let reg2 = /(?<=^| )(?:an)?(?= [^aeiou])/ig
  return str.replace(reg, 'an').replace(reg2, 'a')
}
module.exports = spellcheck

function sentencify(str) {
  // check and correct spelling of indefinite articles
  str = spellcheck(str)

  // auto capitalise first letter of first word
  if(!/^[A-Z]/.test(str))
    str = str[0].toUpperCase() + str.slice(1)

  // add full-stop if does not exist
  str = str.trim()
  if(!/[!.?,:;]$/.test(str))
    str += '.'

  return str
}
module.exports.sentencify = sentencify

},{"./parseText":68}],75:[function(require,module,exports){

/* Convert a noun-phrase, proper-noun or pronoun to a possessive adjective. */
function toPossessiveAdjective(nounPhrase) {
  // handle special cases:
  switch(nounPhrase.toLowerCase()) {
    case 'i':
    case 'me':
      return 'my';

    case 'you':
      return 'your';

    case 'he':
    case 'him':
      return 'his';

    case 'she':
    case 'her':
      return 'her';

    case 'it':
      return 'its'

    case 'we':
      return 'our';

    case 'they':
    case 'them':
      return 'their';
  }

  // regular cases
  let lastWord = nounPhrase.slice(nounPhrase.lastIndexOf(' ')+1)
  if(lastWord[lastWord.length-1] == 's') {
    // Assume that words beginning with a capital letter are proper nouns
    if(/^[A-Z]/.test(lastWord))
      return nounPhrase + "\'s"
    else
      return nounPhrase + "\'"
  } else {
    return nounPhrase + "\'s"
  }
}
module.exports = toPossessiveAdjective

},{}],76:[function(require,module,exports){
// get the subject-form of a pronoun

const subjectForms = {
  'him': 'he',
  'her': 'she',
  'them': 'they',
  'me': 'I',
}

function toSubject(str) {
  if(subjectForms[str])
    return subjectForms[str]
  else
    return str
}
module.exports = toSubject

},{}],77:[function(require,module,exports){
function getSentences(str, decapitalise=true) {
  let lines = str.split('\n')

  let sentences = []

  for(let line of lines) {
    sentences.push(
      ...line.split(/\.(?:\s+|$)/ig).filter(s => s.length)
    )
  }

  sentences = sentences
    .filter(s => s.length)
  if(decapitalise)
    sentences = sentences.map(s => s[0].toLowerCase() + s.slice(1))

  return sentences
}
module.exports = getSentences

},{}],78:[function(require,module,exports){
function *uniqueCombine(...iterators) {
  let yielded = []
  for(let iterator of iterators)
    for(let val of iterator)
      if(!yielded.includes(val)) {
        yielded.push(val)
        yield val
      }
}
module.exports = uniqueCombine

},{}],79:[function(require,module,exports){
module.exports={
  "(ambiences)": [
    "(ambiences)/ambience_urban_city_pedestrians_quiet.mp3",
    "(ambiences)/ftus_city_traffic_busy_street_vendor_loud_speaker_close_by_buon_ma_thuot_vietnam_549.mp3",
    "(ambiences)/kedr_sfx_prague_crowd_day_on_karluv_most_charles_bridge_street_musician_playing_heavy_crowd_movement_boat_passing.mp3",
    "(ambiences)/kedr_sfx_stockholm_roomtone_flat_day_closed_window_ac_hum_calm_street_sounds_behind_wall.mp3",
    "(ambiences)/sound_spark_Flatwoods_Scrub_Rock_Springs_Nature_Forest_General_Ambience_01.mp3",
    "(ambiences)/sound_spark_Flatwoods_Scrub_Rock_Springs_Nature_Forest_Slight_Wind_Loop_03.mp3",
    "(ambiences)/tspt_boiler_room_ambience_loop_010.mp3",
    "(ambiences)/tspt_city_spring_indoor_ambience_loop_019.mp3",
    "(ambiences)/zapsplat_household_abandoned_house_stong_howling_wind_old_wooden_creaky_doors_close_up_and_distant_28337.mp3",
    "(ambiences)/zapsplat_public_places_city_busy_street_traffic_pedestrians_brisbane_australia_27358.mp3"
  ],
  "burp": [
    "burp/reitanna_human_female_burp_001.mp3",
    "burp/reitanna_human_female_burp_002.mp3",
    "burp/reitanna_human_female_burp_003.mp3",
    "burp/zapsplat_human_burp_long_strained_13113.mp3",
    "burp/zapsplat_human_burp_the_word_burp_19549.mp3",
    "burp/zapsplat_human_male_40_years_old_burp_002_20917.mp3",
    "burp/zapsplat_human_male_40_years_old_burp_004_20919.mp3"
  ],
  "busy-street": [
    "busy-street/busy-street 1.wav",
    "busy-street/busy-street 2.wav",
    "busy-street/busy-street 3.wav",
    "busy-street/busy-street 4.wav",
    "busy-street/busy-street 5.wav",
    "busy-street/busy-street 6.wav",
    "busy-street/busy-street 7.wav"
  ],
  "cough": [
    "cough/zapsplat_human_cough_female_60_years_old_001_14549.mp3",
    "cough/zapsplat_human_male_cough_clear_throat_18442.mp3",
    "cough/zapsplat_human_male_cough_soft_wheeze_001_18443.mp3"
  ],
  "dog": [
    "dog/zapsplat_animals_dog_scratch_body_with_leg_collar_shake_30188.mp3",
    "dog/zapsplat_animals_dog_shake_water_off_body_collar_rattle_003_30191.mp3",
    "dog/zapsplat_animals_dog_shake_water_off_body_collar_rattle_004_30192.mp3"
  ],
  "door": [
    "door/zapsplat_household_door_internal_close_gentle_001_21936.mp3",
    "door/zapsplat_household_door_internal_close_gentle_002_21937.mp3",
    "door/zapsplat_household_door_internal_close_hard_001_21938.mp3",
    "door/zapsplat_household_door_internal_close_hard_002_21939.mp3",
    "door/zapsplat_household_door_internal_close_hard_003_21940.mp3"
  ],
  "drip": [
    "drip/zapsplat_multimedia_game_designed_water_drip_onto_surface_003_26336.mp3",
    "drip/zapsplat_nature_water_drip_single_001_27682.mp3"
  ],
  "drop-metal-hard": [
    "drop-metal-hard/zapsplat_foley_metal_pole_med_heavy_drop_001_30598.mp3",
    "drop-metal-hard/zapsplat_foley_metal_pole_med_heavy_drop_002_30599.mp3"
  ],
  "drop-metal-light": [
    "drop-metal-light/zapsplat_impacts_metal_water_bottle_flask_crushed_drop_ground_003_28070.mp3"
  ],
  "eat": [
    "eat/zapsplat_human_eat_bite_crunch_tortilla_chip_001_25694.mp3",
    "eat/zapsplat_human_eat_bite_crunch_tortilla_chip_002_25695.mp3",
    "eat/zapsplat_human_eat_crunch_bite_single_rice_chip_001_28642.mp3",
    "eat/zapsplat_human_eat_crunch_bite_single_rice_chip_004_28645.mp3"
  ],
  "fart": [
    "fart/zapsplat_cartoon_fart_024_21616.mp3",
    "fart/zapsplat_cartoon_fart_029_21621.mp3",
    "fart/zapsplat_cartoon_fart_034_21626.mp3",
    "fart/zapsplat_cartoon_fart_036_21628.mp3",
    "fart/zapsplat_cartoon_fart_037_21629.mp3",
    "fart/zapsplat_cartoon_fart_038_21630.mp3"
  ],
  "fire": [
    "fire/Fire 1.wav",
    "fire/Fire 2.wav",
    "fire/Fire 3.wav",
    "fire/Fire 4.wav",
    "fire/uberduo_Fire_Crackling_In_A_Woodstove_013.mp3"
  ],
  "footstep": [
    "footstep/zapsplat_foley_footstep_single_wooden_hollow_floor_001_23311.mp3",
    "footstep/zapsplat_foley_footstep_single_wooden_hollow_floor_002_23312.mp3",
    "footstep/zapsplat_foley_footstep_single_wooden_hollow_floor_003_23313.mp3",
    "footstep/zapsplat_foley_footstep_single_wooden_hollow_floor_004_23314.mp3",
    "footstep/zapsplat_foley_footstep_single_wooden_hollow_floor_005_23315.mp3",
    "footstep/zapsplat_foley_footstep_single_wooden_hollow_floor_006_23316.mp3",
    "footstep/zapsplat_foley_footstep_single_wooden_hollow_floor_007_23317.mp3",
    "footstep/zapsplat_foley_footstep_single_wooden_hollow_floor_008_23318.mp3",
    "footstep/zapsplat_foley_footstep_single_wooden_hollow_floor_009_23319.mp3",
    "footstep/zapsplat_foley_footstep_single_wooden_hollow_floor_010_23320.mp3",
    "footstep/zapsplat_foley_footstep_single_wooden_hollow_floor_011_23321.mp3",
    "footstep/zapsplat_foley_footstep_single_wooden_hollow_floor_012_23322.mp3",
    "footstep/zapsplat_foley_footstep_single_wooden_hollow_floor_013_23323.mp3",
    "footstep/zapsplat_foley_footstep_single_wooden_hollow_floor_014_23324.mp3",
    "footstep/zapsplat_foley_footstep_single_wooden_hollow_floor_015_23325.mp3",
    "footstep/zapsplat_foley_footstep_single_wooden_hollow_floor_016_23326.mp3",
    "footstep/zapsplat_foley_footstep_single_wooden_hollow_floor_017_23327.mp3",
    "footstep/zapsplat_foley_footstep_single_wooden_hollow_floor_018_23328.mp3",
    "footstep/zapsplat_foley_footstep_single_wooden_hollow_floor_019_23329.mp3",
    "footstep/zapsplat_foley_footstep_single_wooden_hollow_floor_020_23330.mp3"
  ],
  "footstep-highheels": [
    "footstep-highheels/zapsplat_foley_footstep_single_high_heel_metal_004_24544.mp3",
    "footstep-highheels/zapsplat_foley_footstep_single_high_heel_metal_005_24545.mp3",
    "footstep-highheels/zapsplat_foley_footstep_single_high_heel_metal_006_24546.mp3",
    "footstep-highheels/zapsplat_foley_footstep_single_high_heel_metal_008_24548.mp3",
    "footstep-highheels/zapsplat_foley_footstep_single_high_heel_metal_009_24549.mp3"
  ],
  "goose": [
    "goose/animals_bird_goose_honk_once_001.mp3",
    "goose/animals_bird_goose_honk_once_004.mp3",
    "goose/animals_bird_goose_honk_once_005.mp3",
    "goose/animals_bird_goose_honk_twice.mp3",
    "goose/zapsplat_cartoon_honk_horn_or_whistle_001_23530.mp3",
    "goose/zapsplat_cartoon_honk_horn_or_whistle_002_23531.mp3",
    "goose/zapsplat_cartoon_honk_horn_or_whistle_003_23532.mp3",
    "goose/zapsplat_cartoon_honk_horn_or_whistle_004_23533.mp3",
    "goose/zapsplat_cartoon_honk_horn_or_whistle_005_23534.mp3"
  ],
  "hello": [
    "hello/cartoon_character_high_pitched_voice_says_hello.mp3",
    "hello/human_posh_old_english_male_says_oh_hello.mp3",
    "hello/zapsplat_human_male_australian_middle_aged_says_hello_002_15449.mp3",
    "hello/zapsplat_human_male_middle_aged_says_hello_001_15454.mp3",
    "hello/zapsplat_human_male_middle_aged_says_hello_002_15455.mp3",
    "hello/zapsplat_human_voice_male_english_saucy_flirtatious_ohh_hello_002_17492.mp3",
    "hello/zapsplat_human_voice_male_english_saucy_flirtatious_ohh_hello_004_17494.mp3"
  ],
  "jump": [
    "jump/zapsplat_cartoon_plastic_ruler_twang_003_22698.mp3",
    "jump/zapsplat_cartoon_plastic_ruler_twang_008_22703.mp3",
    "jump/zapsplat_cartoon_plastic_ruler_twang_009_22704.mp3",
    "jump/zapsplat_cartoon_plastic_ruler_twang_012_22707.mp3",
    "jump/zapsplat_cartoon_plastic_ruler_twang_013_22708.mp3"
  ],
  "lighter": [
    "lighter/zapsplat_household_cigarette_lighter_flint_flick_x3_16445.mp3",
    "lighter/zapsplat_household_cigarette_lighter_light_001_20389.mp3",
    "lighter/zapsplat_household_cigarette_lighter_light_002_20390.mp3",
    "lighter/zapsplat_household_cigarette_lighter_light_003_20391.mp3",
    "lighter/zapsplat_household_cigarette_lighter_light_004_20392.mp3",
    "lighter/zapsplat_household_cigarette_lighter_light_005_20393.mp3"
  ],
  "lose": [
    "lose/cartoon_fail_strings_trumpet.mp3",
    "lose/cartoon_fail_trumpet_001.mp3",
    "lose/cartoon_fail_trumpet_002.mp3",
    "lose/little_robot_sound_factory_Hero_Death_00.mp3",
    "lose/zapsplat_cartoon_voice_high_pitched_says_loser_15656.mp3",
    "lose/zapsplat_multimedia_game_lose_negative_002.mp3",
    "lose/zapsplat_multimedia_game_retro_musical_descend_fail_lose_life_21483.mp3",
    "lose/zapsplat_multimedia_game_tone_negative_lose_life_17656.mp3",
    "lose/zapsplat_multimedia_male_voice_processed_says_lose_21567.mp3",
    "lose/zapsplat_multimedia_male_voice_processed_says_you_lose_21571.mp3"
  ],
  "meow": [
    "meow/Blastwave_FX_CatMeow_SFXB.203.mp3",
    "meow/animals_cat_meow_001.mp3",
    "meow/animals_cat_meow_002.mp3",
    "meow/zapsplat_animals_cat_kitten_meow_002_30178.mp3",
    "meow/zapsplat_animals_cat_kitten_meow_003_30179.mp3",
    "meow/zapsplat_animals_cat_kitten_meow_007_30183.mp3"
  ],
  "metal-impact": [
    "metal-impact/zapsplat_impacts_metal_road_barrier_knocks_hand_004_29876.mp3",
    "metal-impact/zapsplat_impacts_metal_road_barrier_knocks_hand_006_29878.mp3"
  ],
  "metal-knock": [],
  "music": [
    "music/looperman-l-1838216-0165379-buffer-piano.wav"
  ],
  "put": [
    "put/zapsplat_impacts_hit_wood_table_desk_items_on_rattle_001_19961.mp3",
    "put/zapsplat_impacts_hit_wood_table_desk_items_on_rattle_003_19963.mp3",
    "put/zapsplat_impacts_wood_panel_loose_hit_vibrate_002_20658.mp3"
  ],
  "quiet-door": [
    "quiet-door/uberduo_Door_Bathroom_Hollow_Core_Close_005.mp3",
    "quiet-door/uberduo_Door_Bathroom_Hollow_Core_Open_006.mp3"
  ],
  "quiet-street": [
    "quiet-street/quiet-street 1.wav",
    "quiet-street/quiet-street 2.wav",
    "quiet-street/quiet-street 3.wav",
    "quiet-street/quiet-street 4.wav",
    "quiet-street/quiet-street 5.wav"
  ],
  "room": [
    "room/Room 1.wav",
    "room/Room 2.wav",
    "room/Room 3.wav"
  ],
  "room2": [
    "room2/Room 4.wav",
    "room2/Room 5.wav",
    "room2/Room 6.wav"
  ],
  "scuttle": [
    "scuttle/zapsplat_animals_insect_spider_scuttle_undergrowth_leaves_dirt_003_18480.mp3"
  ],
  "shatter": [
    "shatter/zapsplat_impacts_dish_ceramic_drop_light_smash_001_23643.mp3",
    "shatter/zapsplat_impacts_dish_ceramic_drop_light_smash_002_23644.mp3",
    "shatter/zapsplat_impacts_dish_ceramic_drop_smash_002_23649.mp3",
    "shatter/zapsplat_impacts_plate_dish_ceramic_drop_ground_smash_break_002_21055.mp3"
  ],
  "sunny": [
    "sunny/sunny 1.wav",
    "sunny/sunny 2.wav",
    "sunny/sunny 3.wav",
    "sunny/sunny 4.wav"
  ],
  "win": [
    "win/cartoon_success_fanfair.mp3",
    "win/little_robot_sound_factory_Jingle_Win_00.mp3",
    "win/little_robot_sound_factory_Jingle_Win_Synth_05.mp3",
    "win/zapsplat_multimedia_game_star_win_gain_x8_12394.mp3",
    "win/zapsplat_multimedia_male_voice_processed_says_you_win_002_21573.mp3"
  ],
  "woof": [
    "woof/animal-dog-labrador-single-bark-internal-002.mp3",
    "woof/animal_dog_english_springer_spaniel_single_bark_001 (1).mp3",
    "woof/animal_dog_english_springer_spaniel_single_bark_001.mp3",
    "woof/glitched_tones_Dog+Shih+Tzu+Bark+Single+01.mp3",
    "woof/glitched_tones_Dog+Shih+Tzu+Bark+Single+02.mp3",
    "woof/glitched_tones_Dog+Shih+Tzu+Bark+Single+03.mp3",
    "woof/glitched_tones_Dog+Shih+Tzu+Bark+Single+04.mp3",
    "woof/glitched_tones_Dog+Shih+Tzu+Bark+Single+05.mp3",
    "woof/glitched_tones_Dog+Shih+Tzu+Bark+Single+06.mp3",
    "woof/glitched_tones_Dog+Shih+Tzu+Bark+Single+07.mp3",
    "woof/zapsplat_animals_dog_bark_single_hungarian_pointer_001_24797.mp3",
    "woof/zapsplat_animals_dog_bark_single_hungarian_pointer_002_24798.mp3"
  ]
}
},{}],80:[function(require,module,exports){


const story = require('../src/stories/Cadiz Street.json')
console.log(story)
const StoryLoader = require('../io/StoryLoader')

const dictionary = require('../src/')


window.onload = function() {
  let loader = new StoryLoader(story, dictionary)
  document.body.appendChild(loader.div)
}

},{"../io/StoryLoader":83,"../src/":306,"../src/stories/Cadiz Street.json":357}],81:[function(require,module,exports){
module.exports={
  "bathroom": [
    "bathroom/Bathroom.wav"
  ],
  "bucket": [
    "bucket/Coalhod stereo/Coalhod stereo.wav",
    "bucket/Iron Bucket 1 stereo/Iron Bucket 1 stereo.wav",
    "bucket/Iron Bucket 2 stereo/Iron Bucket 2 stereo.wav"
  ],
  "car": [
    "car/Mercedes van/Mercedes van.wav"
  ],
  "church": [
    "church/Church Buiksloterkerk/1 m-st Buiksloterkerk front/Buiksloot Front.wav",
    "church/Church Buiksloterkerk/2 m-st Buiksloterkerk rear/Buiksloot Rear.wav",
    "church/Church Buiksloterkerk/3 m-q Buiksloterkerk/Buiksloot.1.wav",
    "church/Church Buiksloterkerk/3 m-q Buiksloterkerk/Buiksloot.2.wav",
    "church/Church Buiksloterkerk/3 m-q Buiksloterkerk/Buiksloot.3.wav",
    "church/Church Buiksloterkerk/3 m-q Buiksloterkerk/Buiksloot.4.wav",
    "church/Church Schellingwoude/1 m-st Schellingwoude/Schellingwoude.wav",
    "church/Church Schellingwoude/2 st-st Schellingwoude/Schellingwoude.L.L.wav",
    "church/Church Schellingwoude/2 st-st Schellingwoude/Schellingwoude.L.R.wav",
    "church/Church Schellingwoude/2 st-st Schellingwoude/Schellingwoude.R.L.wav",
    "church/Church Schellingwoude/2 st-st Schellingwoude/Schellingwoude.R.R.wav"
  ],
  "cup": [
    "cup/Glass Cup stereo/Glass Cup stereo.wav"
  ],
  "drum": [
    "drum/Djembe stereo/Djembe stereo.wav"
  ],
  "dustbin": [
    "dustbin/Dustbin 1 stereo/Dustbin 1 stereo.wav",
    "dustbin/Dustbin 2 stereo/Dustbin 2 stereo.wav",
    "dustbin/Dustbin 3 stereo/Dustbin 3 stereo.wav"
  ],
  "flower-pot": [
    "flower-pot/Flower pot 1 stereo/Pot 1 stereo.wav",
    "flower-pot/Flower pot 2 stereo/Pot 2 stereo.wav"
  ],
  "forest": [
    "forest/Forest/Forest 1.wav",
    "forest/Forest/Forest 2.wav",
    "forest/Forest/Forest 3.wav"
  ],
  "kitchen": [
    "kitchen/Small kitchen.wav"
  ],
  "living-room": [
    "living-room/Amsterdam living room 1/Amsterdam living room 1.wav",
    "living-room/Amsterdam living room 2/Amsterdam living room 2.wav"
  ],
  "medium": [
    "medium/SteinmanHall.wav"
  ],
  "small": [
    "small/HartwellTavern.wav",
    "small/StorageTankNo7.wav"
  ],
  "street": [
    "street/Streets/Street 1.wav",
    "street/Streets/Street 2.wav",
    "street/Streets/Street 3.wav",
    "street/Streets/Street 4.wav"
  ],
  "washing-machine": [
    "washing-machine/Washing machine stereo/Washing machine stereo.wav"
  ]
}
},{}],82:[function(require,module,exports){
const EventEmitter = require('events')
const {GameIO} = require('english-io').html
const {
  FactListener,
  WanderingDescriber,
  DescriptionContext,
  sentencify,
  parseImperative,
  randomSentence,
  sub,
  parse,
} = require('english-io')
const MobileEar = require('../src/sound/MobileEar')
const {findBestMatch} = require('string-similarity')


/**
    @class ExplorerGame
    @extends EventEmitter
    @constructor
    @param {Entity} protagonist
*/
class ExplorerGame extends EventEmitter {
  constructor({
    protagonist, dictionary, audioDestination,
    useTickyText, useResponsiveVoice,
    specialSyntaxs=null,
  }) {
    if(!protagonist || !protagonist.isEntity)
      throw 'ExplorerGame constructor expects a Entity protagonist as argument'

    super()

    // the function to be used in the `move` event listener on the protagonist
    this.onProtagonistMove = (...args) => this.emit('protagonistMove', ...args)

    // create predicateSet, IO, changeListener and wandering describer
    this.io = new GameIO({
      useTickyText: useTickyText,
      useResponsiveVoice: useResponsiveVoice,
    })
    this.wanderingDescriber = new WanderingDescriber(protagonist)
    this.wanderingDescriber.includeHistory = true
    this.changeListener = new FactListener
    this.ctx = new DescriptionContext
    this.io.descriptionCtx = this.ctx
    this.mainTense = 'simple_present'
    this.dictionary = dictionary
    this.specialSyntaxs = []

    if(specialSyntaxs)
      this.addSpecialSyntaxs(...specialSyntaxs)

    // set up soundplayer
    this.audioDestination = audioDestination
    if(this.audioDestination){
      this.mobileEar = new MobileEar({
        audioDestination: this.audioDestination,
        upDepth: 1
      })
      this.on('changeProtagonist',
        newProtagonist => {
          this.mobileEar.protagonist = newProtagonist
        }
      )
    }

    // every six seconds print a bit from the wandering describer
    this.lastSuggestion = null
    setInterval(() => {
      if(Math.random() < 0.75) {
        let sentences = this.wanderingDescriber.nextFew(2)
        if(sentences)
          this.io.print(...sentences)
      } else {
        let sentence = this.randomAction()
        this.lastSuggestion = sentence.str('imperative', this.ctx.duplicate())
        this.io.print(
          sentencify('perhaps '+ sentence.str('possible_present', this.ctx))+' '
        )
      }
    }, 10000)
    let sentences = this.wanderingDescriber.nextFew(2)
    if(sentences)
      this.io.print(...sentences)

    // feed changes in game world into the io output
    this.changeListener.on('fact', change => {
      change.important = true
      this.io.print(change)
      this.wanderingDescriber.log(change)
    })

    // feed input from the GameIO into the Explorer Game
    this.io.on('input', str => this.input(str))



    /* The entity that the player 'is'*/
    this.protagonist = protagonist
  }

  input(str) {
    if(str == '') {
      let action = this.lastSuggestion || this.randomAction().str('imperative')
      this.lastSuggestion = null
      this.io.monitor('Chosen random command: '+action + '\n')
      return this.input(action)
    }

    // emit an input event
    this.emit('input', str)

    // parse the string as an input
    let args
    for(let syntax of this.specialSyntaxs)
      if(args = syntax.parse(str, this.ctx, this.protagonist)) {
        let out = syntax.exec(args, this.protagonist)
        if(out) {
          this.io.print(out)
          return
        }
      }

    let parsed = parse.imperative(
      this.protagonist, str, this.dictionary, this.ctx
    )
    if(parsed) {
      if(parsed.isParsedSentence) {
        let sentence = parsed.start(this.protagonist)

        if(sentence.truthValue == 'true' || sentence.truthValue == 'replaced') {
          this.wanderingDescriber.log(sentence)
        } else if(sentence.truthValue == 'failed') {
          this.io.println(sentencify(sub(
            '_ because _',
            sentence.str('negative_possible_present'),
            sentence.failureReason,
          ).str()))
        } else if(sentence.truthValue == 'planned') {
          sentence.on('start', () => this.wanderingDescriber.log(sentence))
          sentence.on('problem', reason => this.io.println(sentencify(sub(
            '_ because _',
            sentence.str('negative_possible_present'),
            reason,
          ).str())))
        } else {
          console.warn('Unhandled user instruction:', str, sentence)
        }
      } else if(parsed.isParsedSpecialSentence) {
        parsed.start(this.protagonist)
      } else {
        console.warn('Unrecognised parse object,', parsed, ', for \"'+str+'\"')
      }
    } else if(parsed = parse.sentence(str, this.dictionary, this.ctx)) {
      let result = parsed.start(this.protagonist)
      if(result && result.isSentence)
        this.wanderingDescriber.log(result)
      else
        console.warn('Unhandled user declaration:', str)
    } else
      this.io.println(
        "I'm sorry, I do not understand \""+str+"\". "
        + 'Why not try entering: \"' + this.bestMatchAction(str, undefined, this.ctx.duplicate()) + '\"?'
      )
  }

  get protagonist() {
    // return the current protagonist
    return this._protagonist
  }
  set protagonist(newProtagonist) {
    // set a new protagonist
    if(!newProtagonist || !newProtagonist.isEntity)
      throw "Game#protagonist (set) expects a Entityenon"

    // remove listeners from old protagonist
    if(this._protagonist) {
      this._protagonist.removeListener('move', this.onProtagonistMove)
      this.changeListener.remove(this._protagonist)
    }

    // change the protagonist
    this._protagonist = newProtagonist

    // add listeners to the new protagonist
    newProtagonist.on('move', this.onProtagonistMove)
    this.changeListener.add(newProtagonist)

    // emit the `changeProtagonist` event
    this.emit('changeProtagonist', this._protagonist)
  }

  randomSentence() {
    return randomSentence(this.dictionary, this.protagonist)
  }

  randomAction() {
    return randomSentence.imperative(
      this.dictionary,
      this.protagonist,
      this.protagonist
    )
  }

  bestMatchAction(str, n=50, ctx) {
    let choices = []
    for(let i=0; i<n; i++)
      choices.push(this.randomAction().str('imperative', ctx))

    let r =  findBestMatch(str, choices).bestMatch.target
    return r
  }

  addSpecialSyntaxs(...syntaxs) {
    for(let syntax of syntaxs) {
      syntax.dictionary = this.dictionary
      this.specialSyntaxs.push(syntax)
    }
  }
}
module.exports = ExplorerGame

},{"../src/sound/MobileEar":347,"english-io":261,"events":362,"string-similarity":288}],83:[function(require,module,exports){
const {unSentencify, declare, DescriptionContext} = require('english-io')
const ExplorerGame = require('./ExplorerGame')

class StoryLoader {
  constructor(story, dictionary) {
    this.story = story
    this.dictionary = dictionary
    this.makeHTML()
  }

  makeHTML() {
    let div = document.createElement('DIV')
    div.className = 'gameloader'
    div.onclick = () => this.begin()

    let infoSpan = document.createElement('infoSpan')
    infoSpan.className = 'gameloader_info'
    infoSpan.innerText = 'Click to begin...'
    div.appendChild(infoSpan)

    this.infoSpan = infoSpan
    this.div = div
    return div
  }

  async begin() {
    let story = await this.story
    let sentences = unSentencify(this.story.text, false)

    let domain = []
    let ctx = new DescriptionContext

    for(let str of sentences) {
      this.info = 'Loading: '+ str
      await wait(10)
      let result
      try {
        result = declare.single(this.dictionary, ctx, domain, str)
      } catch(e) {
        console.warn(e)
      }
      if(result) {
        domain = result.domain
        ctx = result.ctx
      }
    }
    this.info = 'ready!'

    let game = new ExplorerGame({
      protagonist:domain[0],
      dictionary: this.dictionary,
      audioDestination: new AudioContext().destination,
      useResponsiveVoice: true,
      useTickyText: false,
      specialSyntaxs: this.dictionary.gameSyntaxs,
    })

    this.div.parentNode.replaceChild(game.io.div, this.div)
  }

  set info(str) {
    this.infoSpan.innerText = str
  }

  get info() {
    return this.infoSpan.innerText
  }
}
module.exports = StoryLoader


function wait(milliseconds=100) {
  return new Promise((fulfil) => setTimeout(fulfil, milliseconds))
}

},{"./ExplorerGame":82,"english-io":261}],84:[function(require,module,exports){
"use strict";

// rawAsap provides everything we need except exception management.
var rawAsap = require("./raw");
// RawTasks are recycled to reduce GC churn.
var freeTasks = [];
// We queue errors to ensure they are thrown in right order (FIFO).
// Array-as-queue is good enough here, since we are just dealing with exceptions.
var pendingErrors = [];
var requestErrorThrow = rawAsap.makeRequestCallFromTimer(throwFirstError);

function throwFirstError() {
    if (pendingErrors.length) {
        throw pendingErrors.shift();
    }
}

/**
 * Calls a task as soon as possible after returning, in its own event, with priority
 * over other events like animation, reflow, and repaint. An error thrown from an
 * event will not interrupt, nor even substantially slow down the processing of
 * other events, but will be rather postponed to a lower priority event.
 * @param {{call}} task A callable object, typically a function that takes no
 * arguments.
 */
module.exports = asap;
function asap(task) {
    var rawTask;
    if (freeTasks.length) {
        rawTask = freeTasks.pop();
    } else {
        rawTask = new RawTask();
    }
    rawTask.task = task;
    rawAsap(rawTask);
}

// We wrap tasks with recyclable task objects.  A task object implements
// `call`, just like a function.
function RawTask() {
    this.task = null;
}

// The sole purpose of wrapping the task is to catch the exception and recycle
// the task object after its single use.
RawTask.prototype.call = function () {
    try {
        this.task.call();
    } catch (error) {
        if (asap.onerror) {
            // This hook exists purely for testing purposes.
            // Its name will be periodically randomized to break any code that
            // depends on its existence.
            asap.onerror(error);
        } else {
            // In a web browser, exceptions are not fatal. However, to avoid
            // slowing down the queue of pending tasks, we rethrow the error in a
            // lower priority turn.
            pendingErrors.push(error);
            requestErrorThrow();
        }
    } finally {
        this.task = null;
        freeTasks[freeTasks.length] = this;
    }
};

},{"./raw":85}],85:[function(require,module,exports){
(function (global){
"use strict";

// Use the fastest means possible to execute a task in its own turn, with
// priority over other events including IO, animation, reflow, and redraw
// events in browsers.
//
// An exception thrown by a task will permanently interrupt the processing of
// subsequent tasks. The higher level `asap` function ensures that if an
// exception is thrown by a task, that the task queue will continue flushing as
// soon as possible, but if you use `rawAsap` directly, you are responsible to
// either ensure that no exceptions are thrown from your task, or to manually
// call `rawAsap.requestFlush` if an exception is thrown.
module.exports = rawAsap;
function rawAsap(task) {
    if (!queue.length) {
        requestFlush();
        flushing = true;
    }
    // Equivalent to push, but avoids a function call.
    queue[queue.length] = task;
}

var queue = [];
// Once a flush has been requested, no further calls to `requestFlush` are
// necessary until the next `flush` completes.
var flushing = false;
// `requestFlush` is an implementation-specific method that attempts to kick
// off a `flush` event as quickly as possible. `flush` will attempt to exhaust
// the event queue before yielding to the browser's own event loop.
var requestFlush;
// The position of the next task to execute in the task queue. This is
// preserved between calls to `flush` so that it can be resumed if
// a task throws an exception.
var index = 0;
// If a task schedules additional tasks recursively, the task queue can grow
// unbounded. To prevent memory exhaustion, the task queue will periodically
// truncate already-completed tasks.
var capacity = 1024;

// The flush function processes all tasks that have been scheduled with
// `rawAsap` unless and until one of those tasks throws an exception.
// If a task throws an exception, `flush` ensures that its state will remain
// consistent and will resume where it left off when called again.
// However, `flush` does not make any arrangements to be called again if an
// exception is thrown.
function flush() {
    while (index < queue.length) {
        var currentIndex = index;
        // Advance the index before calling the task. This ensures that we will
        // begin flushing on the next task the task throws an error.
        index = index + 1;
        queue[currentIndex].call();
        // Prevent leaking memory for long chains of recursive calls to `asap`.
        // If we call `asap` within tasks scheduled by `asap`, the queue will
        // grow, but to avoid an O(n) walk for every task we execute, we don't
        // shift tasks off the queue after they have been executed.
        // Instead, we periodically shift 1024 tasks off the queue.
        if (index > capacity) {
            // Manually shift all values starting at the index back to the
            // beginning of the queue.
            for (var scan = 0, newLength = queue.length - index; scan < newLength; scan++) {
                queue[scan] = queue[scan + index];
            }
            queue.length -= index;
            index = 0;
        }
    }
    queue.length = 0;
    index = 0;
    flushing = false;
}

// `requestFlush` is implemented using a strategy based on data collected from
// every available SauceLabs Selenium web driver worker at time of writing.
// https://docs.google.com/spreadsheets/d/1mG-5UYGup5qxGdEMWkhP6BWCz053NUb2E1QoUTU16uA/edit#gid=783724593

// Safari 6 and 6.1 for desktop, iPad, and iPhone are the only browsers that
// have WebKitMutationObserver but not un-prefixed MutationObserver.
// Must use `global` or `self` instead of `window` to work in both frames and web
// workers. `global` is a provision of Browserify, Mr, Mrs, or Mop.

/* globals self */
var scope = typeof global !== "undefined" ? global : self;
var BrowserMutationObserver = scope.MutationObserver || scope.WebKitMutationObserver;

// MutationObservers are desirable because they have high priority and work
// reliably everywhere they are implemented.
// They are implemented in all modern browsers.
//
// - Android 4-4.3
// - Chrome 26-34
// - Firefox 14-29
// - Internet Explorer 11
// - iPad Safari 6-7.1
// - iPhone Safari 7-7.1
// - Safari 6-7
if (typeof BrowserMutationObserver === "function") {
    requestFlush = makeRequestCallFromMutationObserver(flush);

// MessageChannels are desirable because they give direct access to the HTML
// task queue, are implemented in Internet Explorer 10, Safari 5.0-1, and Opera
// 11-12, and in web workers in many engines.
// Although message channels yield to any queued rendering and IO tasks, they
// would be better than imposing the 4ms delay of timers.
// However, they do not work reliably in Internet Explorer or Safari.

// Internet Explorer 10 is the only browser that has setImmediate but does
// not have MutationObservers.
// Although setImmediate yields to the browser's renderer, it would be
// preferrable to falling back to setTimeout since it does not have
// the minimum 4ms penalty.
// Unfortunately there appears to be a bug in Internet Explorer 10 Mobile (and
// Desktop to a lesser extent) that renders both setImmediate and
// MessageChannel useless for the purposes of ASAP.
// https://github.com/kriskowal/q/issues/396

// Timers are implemented universally.
// We fall back to timers in workers in most engines, and in foreground
// contexts in the following browsers.
// However, note that even this simple case requires nuances to operate in a
// broad spectrum of browsers.
//
// - Firefox 3-13
// - Internet Explorer 6-9
// - iPad Safari 4.3
// - Lynx 2.8.7
} else {
    requestFlush = makeRequestCallFromTimer(flush);
}

// `requestFlush` requests that the high priority event queue be flushed as
// soon as possible.
// This is useful to prevent an error thrown in a task from stalling the event
// queue if the exception handled by Node.js’s
// `process.on("uncaughtException")` or by a domain.
rawAsap.requestFlush = requestFlush;

// To request a high priority event, we induce a mutation observer by toggling
// the text of a text node between "1" and "-1".
function makeRequestCallFromMutationObserver(callback) {
    var toggle = 1;
    var observer = new BrowserMutationObserver(callback);
    var node = document.createTextNode("");
    observer.observe(node, {characterData: true});
    return function requestCall() {
        toggle = -toggle;
        node.data = toggle;
    };
}

// The message channel technique was discovered by Malte Ubl and was the
// original foundation for this library.
// http://www.nonblocking.io/2011/06/windownexttick.html

// Safari 6.0.5 (at least) intermittently fails to create message ports on a
// page's first load. Thankfully, this version of Safari supports
// MutationObservers, so we don't need to fall back in that case.

// function makeRequestCallFromMessageChannel(callback) {
//     var channel = new MessageChannel();
//     channel.port1.onmessage = callback;
//     return function requestCall() {
//         channel.port2.postMessage(0);
//     };
// }

// For reasons explained above, we are also unable to use `setImmediate`
// under any circumstances.
// Even if we were, there is another bug in Internet Explorer 10.
// It is not sufficient to assign `setImmediate` to `requestFlush` because
// `setImmediate` must be called *by name* and therefore must be wrapped in a
// closure.
// Never forget.

// function makeRequestCallFromSetImmediate(callback) {
//     return function requestCall() {
//         setImmediate(callback);
//     };
// }

// Safari 6.0 has a problem where timers will get lost while the user is
// scrolling. This problem does not impact ASAP because Safari 6.0 supports
// mutation observers, so that implementation is used instead.
// However, if we ever elect to use timers in Safari, the prevalent work-around
// is to add a scroll event listener that calls for a flush.

// `setTimeout` does not call the passed callback if the delay is less than
// approximately 7 in web workers in Firefox 8 through 18, and sometimes not
// even then.

function makeRequestCallFromTimer(callback) {
    return function requestCall() {
        // We dispatch a timeout with a specified delay of 0 for engines that
        // can reliably accommodate that request. This will usually be snapped
        // to a 4 milisecond delay, but once we're flushing, there's no delay
        // between events.
        var timeoutHandle = setTimeout(handleTimer, 0);
        // However, since this timer gets frequently dropped in Firefox
        // workers, we enlist an interval handle that will try to fire
        // an event 20 times per second until it succeeds.
        var intervalHandle = setInterval(handleTimer, 50);

        function handleTimer() {
            // Whichever timer succeeds will cancel both timers and
            // execute the callback.
            clearTimeout(timeoutHandle);
            clearInterval(intervalHandle);
            callback();
        }
    };
}

// This is for `asap.js` only.
// Its name will be periodically randomized to break any code that depends on
// its existence.
rawAsap.makeRequestCallFromTimer = makeRequestCallFromTimer;

// ASAP was originally a nextTick shim included in Q. This was factored out
// into this ASAP package. It was later adapted to RSVP which made further
// amendments. These decisions, particularly to marginalize MessageChannel and
// to capture the MutationObserver implementation in a closure, were integrated
// back into ASAP proper.
// https://github.com/tildeio/rsvp.js/blob/cddf7232546a9cf858524b75cde6f9edf72620a7/lib/rsvp/asap.js

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],86:[function(require,module,exports){
module.exports = function _atob(str) {
  return atob(str)
}

},{}],87:[function(require,module,exports){
/**
 * AudioBuffer class
 *
 * @module audio-buffer/buffer
 *
 */
'use strict'

var isAudioBuffer = require('is-audio-buffer')
var inherit = require('inherits')
var util = require('audio-buffer-utils')
var AudioBuffer = require('audio-buffer')
var extend = require('object-assign')
var nidx = require('negative-index')
var isPlainObj = require('is-plain-obj')
var Emitter = require('events')

module.exports = AudioBufferList


inherit(AudioBufferList, Emitter)


function AudioBufferList(arg, options) {
  if (!(this instanceof AudioBufferList)) return new AudioBufferList(arg, options)

  if (typeof options === 'number') {
    options = {channels: options}
  }
  if (options && options.channels != null) options.numberOfChannels = options.channels

  extend(this, options)

  this.buffers = []
  this.length = 0
  this.duration = 0

  this.append(arg)
}


//AudioBuffer interface
AudioBufferList.prototype.numberOfChannels = 2
AudioBufferList.prototype.sampleRate = null

//copy from channel into destination array
AudioBufferList.prototype.copyFromChannel = function (destination, channel, startInChannel) {
  if (startInChannel == null) startInChannel = 0
  var offsets = this.offset(startInChannel)
  var offset = startInChannel - offsets[1]
  var initialOffset = offsets[1]
  for (var i = offsets[0], l = this.buffers.length; i < l; i++) {
    var buf = this.buffers[i]
    var data = buf.getChannelData(channel)
    if (startInChannel > offset) data = data.subarray(startInChannel)
    if (channel < buf.numberOfChannels) {
      destination.set(data, Math.max(0, offset - initialOffset))
    }
    offset += buf.length
  }
}

//put data from array to channel
AudioBufferList.prototype.copyToChannel = function (source, channel, startInChannel) {
  if (startInChannel == null) startInChannel = 0
  var offsets = this.offset(startInChannel)
  var offset = startInChannel - offsets[1]
  for (var i = offsets[0], l = this.buffers.length; i < l; i++) {
    var buf = this.buffers[i]
    var data = buf.getChannelData(channel)
    if (channel < buf.numberOfChannels) {
      data.set(source.subarray(Math.max(offset, startInChannel), offset + data.length), Math.max(0, startInChannel - offset));
    }
    offset += buf.length
  }
}

//return float array with channel data
AudioBufferList.prototype.getChannelData = function (channel, from, to) {
  if (from == null) from = 0
  if (to == null) to = this.length
  from = nidx(from, this.length)
  to = nidx(to, this.length)

  if (!this.buffers.length || from === to) return new Float32Array()

  //shortcut single buffer preserving subarraying
  if (this.buffers.length === 1) {
    return this.buffers[0].getChannelData(channel).subarray(from, to)
  }

  var floatArray = this.buffers[0].getChannelData(0).constructor
  var data = new floatArray(to - from)
  var fromOffset = this.offset(from)
  var toOffset = this.offset(to)

  var firstBuf = this.buffers[fromOffset[0]]
  data.set(firstBuf.getChannelData(channel).subarray(fromOffset[1]))

  var offset = -fromOffset[1] + firstBuf.length
  for (var i = fromOffset[0] + 1, l = toOffset[0]; i < l; i++) {
    var buf = this.buffers[i]
    data.set(buf.getChannelData(channel), offset);
    offset += buf.length
  }
  var lastBuf = this.buffers[toOffset[0]]
  data.set(lastBuf.getChannelData(channel).subarray(0, toOffset[1]), offset)

  return data
}


//patch BufferList methods
AudioBufferList.prototype.append = function (buf) {
	//FIXME: we may want to do resampling/channel mapping here or something
	var i = 0

  // unwrap argument into individual BufferLists
  if (buf instanceof AudioBufferList) {
    this.append(buf.buffers)
  }
  else if (isAudioBuffer(buf) && buf.length) {
    this._appendBuffer(buf)
  }
  else if (Array.isArray(buf)) {
    for (var l = buf.length; i < l; i++) {
      this.append(buf[i])
    }
  }
  //create AudioBuffer from (possibly num) arg
  else if (buf) {
		buf = new AudioBuffer(this.numberOfChannels || 2, buf)
		this._appendBuffer(buf)
	}

	return this
}


AudioBufferList.prototype.offset = function _offset (offset) {
  var tot = 0, i = 0, _t
  if (offset === 0) return [ 0, 0 ]
  for (; i < this.buffers.length; i++) {
    _t = tot + this.buffers[i].length
    if (offset < _t || i == this.buffers.length - 1)
      return [ i, offset - tot ]
    tot = _t
  }
}


AudioBufferList.prototype._appendBuffer = function (buf) {
  if (!buf) return this

  //update channels count
  if (!this.buffers.length) {
    this.numberOfChannels = buf.numberOfChannels
  }
  else {
    this.numberOfChannels = Math.max(this.numberOfChannels, buf.numberOfChannels)
  }
  this.duration += buf.duration

  //init sampleRate
  if (!this.sampleRate) this.sampleRate = buf.sampleRate

  //push buffer
  this.buffers.push(buf)
  this.length += buf.length

  return this
}

//copy data to destination audio buffer
AudioBufferList.prototype.copy = function copy (dst, dstStart, srcStart, srcEnd) {
	if (typeof srcStart != 'number' || srcStart < 0)
		srcStart = 0
	if (typeof srcEnd != 'number' || srcEnd > this.length)
		srcEnd = this.length
	if (srcStart >= this.length)
		return dst || new AudioBuffer(this.numberOfChannels, 0)
	if (srcEnd <= 0)
		return dst || new AudioBuffer(this.numberOfChannels, 0)

  var copy   = !!dst
    , off    = this.offset(srcStart)
    , len    = srcEnd - srcStart
    , bytes  = len
    , bufoff = (copy && dstStart) || 0
    , start  = off[1]
    , l
    , i

  // copy/slice everything
  if (srcStart === 0 && srcEnd == this.length) {
    if (!copy) { // slice, but full concat if multiple buffers
      return this.buffers.length === 1
        ? util.slice(this.buffers[0])
        : util.concat(this.buffers)
    }
    // copy, need to copy individual buffers
    for (i = 0; i < this.buffers.length; i++) {
      util.copy(this.buffers[i], dst, bufoff)
      bufoff += this.buffers[i].length
    }

    return dst
  }

  // easy, cheap case where it's a subset of one of the buffers
  if (bytes <= this.buffers[off[0]].length - start) {
    return copy
      ? util.copy(util.subbuffer(this.buffers[off[0]], start, start + bytes), dst, dstStart)
      : util.slice(this.buffers[off[0]], start, start + bytes)
  }

  if (!copy) // a slice, we need something to copy in to
    dst = new AudioBuffer(this.numberOfChannels, len)

  for (i = off[0]; i < this.buffers.length; i++) {
    l = this.buffers[i].length - start

    if (bytes > l) {
      util.copy(util.subbuffer(this.buffers[i], start), dst, bufoff)
    } else {
      util.copy(util.subbuffer(this.buffers[i], start, start + bytes), dst, bufoff)
      break
    }

    bufoff += l
    bytes -= l

    if (start)
      start = 0
  }

  return dst
}

//do superficial handle
AudioBufferList.prototype.slice = function slice (start, end) {
  start = start || 0
  end = end == null ? this.length : end

  start = nidx(start, this.length)
  end = nidx(end, this.length)

  if (start == end) {
    return new AudioBufferList(0, this.numberOfChannels)
  }

  var startOffset = this.offset(start)
    , endOffset = this.offset(end)
    , buffers = this.buffers.slice(startOffset[0], endOffset[0] + 1)

  if (endOffset[1] == 0) {
    buffers.pop()
  }
  else {
    buffers[buffers.length-1] = util.subbuffer(buffers[buffers.length-1], 0, endOffset[1])
  }

  if (startOffset[1] != 0) {
    buffers[0] = util.subbuffer(buffers[0], startOffset[1])
  }

  return new AudioBufferList(buffers, this.numberOfChannels)
}

//clone with preserving data
AudioBufferList.prototype.clone = function clone (start, end) {
  var i = 0, copy = new AudioBufferList(0, this.numberOfChannels), sublist = this.slice(start, end)

  for (; i < sublist.buffers.length; i++)
    copy.append(util.clone(sublist.buffers[i]))

  return copy
}

//clean up
AudioBufferList.prototype.destroy = function destroy () {
  this.buffers.length = 0
  this.length = 0
}


//repeat contents N times
AudioBufferList.prototype.repeat = function (times) {
  times = Math.floor(times)
  if (!times && times !== 0 || !Number.isFinite(times)) throw RangeError('Repeat count must be non-negative number.')

  if (!times) {
    this.consume(this.length)
    return this
  }

  if (times === 1) return this

  var data = this

  for (var i = 1; i < times; i++) {
    data = new AudioBufferList(data.copy())
    this.append(data)
  }

  return this
}

//insert new buffer/buffers at the offset
AudioBufferList.prototype.insert = function (offset, source) {
  if (source == null) {
    source = offset
    offset = 0
  }

  offset = nidx(offset, this.length)

  this.split(offset)

  var offset = this.offset(offset)

  //convert any type of source to audio buffer list
  source = new AudioBufferList(source)
  this.buffers.splice.apply(this.buffers, [offset[0], 0].concat(source.buffers))

  //update params
  this.length += source.length
  this.duration += source.duration
  this.numberOfChannels = Math.max(source.numberOfChannels, this.numberOfChannels)

  return this
}

//delete N samples from any position
AudioBufferList.prototype.remove = function (offset, count) {
  if (count == null) {
    count = offset
    offset = 0
  }
  if (!count) return this

  if (count < 0) {
    count = -count
    offset -= count
  }

  offset = nidx(offset, this.length)
  count = Math.min(this.length - offset, count)

  this.split(offset, offset + count)

  var offsetLeft = this.offset(offset)
  var offsetRight = this.offset(offset + count)

  if (offsetRight[1] === this.buffers[offsetRight[0]].length) {
    offsetRight[0] += 1
  }

  let deleted = this.buffers.splice(offsetLeft[0], offsetRight[0] - offsetLeft[0])
  deleted = new AudioBufferList(deleted, this.numberOfChannels)

  this.length -= deleted.length
  this.duration = this.length / this.sampleRate

  return deleted
}

//delete samples from the list, return self
AudioBufferList.prototype.delete = function () {
  this.remove.apply(this, arguments)
  return this
}

//remove N sampled from the beginning
AudioBufferList.prototype.consume = function consume (size) {
  while (this.buffers.length) {
    if (size >= this.buffers[0].length) {
      size -= this.buffers[0].length
      this.length -= this.buffers[0].length
      this.buffers.shift()
    } else {
      //util.subbuffer would remain buffer in memory though it is faster
      this.buffers[0] = util.subbuffer(this.buffers[0], size)
      this.length -= size
      break
    }
  }
  this.duration = this.length / this.sampleRate
  return this
}


//return new list via applying fn to each buffer from the indicated range
AudioBufferList.prototype.map = function map (fn, from, to) {
  if (from == null) from = 0
  if (to == null) to = this.length
  from = nidx(from, this.length)
  to = nidx(to, this.length)

  let fromOffset = this.offset(from)
  let toOffset = this.offset(to)

  let offset = from - fromOffset[1]
  let before = this.buffers.slice(0, fromOffset[0])
  let after = this.buffers.slice(toOffset[0] + 1)
  let middle = this.buffers.slice(fromOffset[0], toOffset[0] + 1)

  middle = middle.map((buf, idx) => {
    let result = fn.call(this, buf, idx, offset, this.buffers, this)
    if (result === undefined || result === true) result = buf
    //ignore removed buffers
    if (!result) {
      return null;
    }

    //track offset
    offset += result.length

    return result
  })
  .filter((buf) => {
    return buf ? !!buf.length : false
  })

  return new AudioBufferList(before.concat(middle).concat(after), this.numberOfChannels)
}

//apply fn to every buffer for the indicated range
AudioBufferList.prototype.each = function each (fn, from, to, reversed) {
  let options = arguments[arguments.length - 1]
  if (!isPlainObj(options)) options = {reversed: false}

  if (typeof from != 'number') from = 0
  if (typeof to != 'number') to = this.length
  from = nidx(from, this.length)
  to = nidx(to, this.length)

  let fromOffset = this.offset(from)
  let toOffset = this.offset(to)

  let middle = this.buffers.slice(fromOffset[0], toOffset[0] + 1)

  if (options.reversed) {
    let offset = to - toOffset[1]
    for (let i = toOffset[0], l = fromOffset[0]; i >= l; i--) {
      let buf = this.buffers[i]
      let res = fn.call(this, buf, i, offset, this.buffers, this)
      if (res === false) break
      offset -= buf.length
    }
  }
  else {
    let offset = from - fromOffset[1]
    for (let i = fromOffset[0], l = toOffset[0]+1; i < l; i++) {
      let buf = this.buffers[i]
      let res = fn.call(this, buf, i, offset, this.buffers, this)
      if (res === false) break
      offset += buf.length
    }
  }

  return this;
}

//reverse subpart
AudioBufferList.prototype.reverse = function reverse (from, to) {
  if (from == null) from = 0
  if (to == null) to = this.length

  from = nidx(from, this.length)
  to = nidx(to, this.length)

  let sublist = this.slice(from, to)
  .each((buf) => {
    util.reverse(buf)
  })
  sublist.buffers.reverse()

  this.remove(from, to-from)

  this.insert(from, sublist)

  return this
}

//split at the indicated indexes
AudioBufferList.prototype.split = function split () {
  let args = arguments;

  for (let i = 0; i < args.length; i++ ) {
    let arg = args[i]
    if (Array.isArray(arg)) {
      this.split.apply(this, arg)
    }
    else if (typeof arg === 'number') {
      let offset = this.offset(arg)
      let buf = this.buffers[offset[0]]

      if (offset[1] > 0 && offset[1] < buf.length) {
        let left = util.subbuffer(buf, 0, offset[1])
        let right = util.subbuffer(buf, offset[1])

        this.buffers.splice(offset[0], 1, left, right)
      }
    }
  }

  return this
}


//join buffers within the subrange
AudioBufferList.prototype.join = function join (from, to) {
  if (from == null) from = 0
  if (to == null) to = this.length

  from = nidx(from, this.length)
  to = nidx(to, this.length)

  let fromOffset = this.offset(from)
  let toOffset = this.offset(to)

  let bufs = this.buffers.slice(fromOffset[0], toOffset[0])
  let buf = util.concat(bufs)

  this.buffers.splice.apply(this.buffers, [fromOffset[0], toOffset[0] - fromOffset[0] + (toOffset[1] ? 1 : 0)].concat(buf))

  return this
}

},{"audio-buffer":88,"audio-buffer-utils":89,"events":362,"inherits":263,"is-audio-buffer":264,"is-plain-obj":268,"negative-index":270,"object-assign":272}],88:[function(require,module,exports){
/**
 * AudioBuffer class
 *
 * @module audio-buffer/buffer
 */
'use strict'

var isBuffer = require('is-buffer')
var b2ab = require('buffer-to-arraybuffer')
var isBrowser = require('is-browser')
var isAudioBuffer = require('is-audio-buffer')
var context = require('audio-context')
var isPlainObj = require('is-plain-obj')


module.exports = AudioBuffer


/**
 * @constructor
 *
 * @param {∀} data Any collection-like object
 */
function AudioBuffer (channels, data, sampleRate, options) {
	//enforce class
	if (!(this instanceof AudioBuffer)) return new AudioBuffer(channels, data, sampleRate, options);

	//detect last argument
	var c = arguments.length
	while (!arguments[c] && c) c--;
	var lastArg = arguments[c];

	//figure out options
	var ctx, isWAA, floatArray, isForcedType = false
	if (lastArg && typeof lastArg != 'number') {
		ctx = lastArg.context || (context && context())
		isWAA = lastArg.isWAA != null ? lastArg.isWAA : !!(isBrowser && ctx.createBuffer)
		floatArray = lastArg.floatArray || Float32Array
		if (lastArg.floatArray) isForcedType = true
	}
	else {
		ctx = context && context()
		isWAA = !!ctx
		floatArray = Float32Array
	}

	//if one argument only - it is surely data or length
	//having new AudioBuffer(2) does not make sense as 2 being number of channels
	if (data == null || isPlainObj(data)) {
		data = channels || 1;
		channels = null;
	}
	//audioCtx.createBuffer() - complacent arguments
	else {
		if (typeof sampleRate == 'number') this.sampleRate = sampleRate;
		else if (isBrowser) this.sampleRate = ctx.sampleRate;
		if (channels != null) this.numberOfChannels = channels;
	}

	//if AudioBuffer(channels?, number, rate?) = create new array
	//this is the default WAA-compatible case
	if (typeof data === 'number') {
		this.length = data;
		this.data = []
		for (var c = 0; c < this.numberOfChannels; c++) {
			this.data[c] = new floatArray(data)
		}
	}
	//if other audio buffer passed - create fast clone of it
	//if WAA AudioBuffer - get buffer’s data (it is bounded)
	else if (isAudioBuffer(data)) {
		this.length = data.length;
		if (channels == null) this.numberOfChannels = data.numberOfChannels;
		if (sampleRate == null) this.sampleRate = data.sampleRate;

		this.data = []

		//copy channel's data
		for (var c = 0, l = this.numberOfChannels; c < l; c++) {
			this.data[c] = data.getChannelData(c).slice()
		}
	}
	//TypedArray, Buffer, DataView etc, or ArrayBuffer
	//NOTE: node 4.x+ detects Buffer as ArrayBuffer view
	else if (ArrayBuffer.isView(data) || data instanceof ArrayBuffer || isBuffer(data)) {
		if (isBuffer(data)) {
			data = b2ab(data);
		}
		//convert non-float array to floatArray
		if (!(data instanceof Float32Array) && !(data instanceof Float64Array)) {
			data = new floatArray(data.buffer || data);
		}

		this.length = Math.floor(data.length / this.numberOfChannels);
		this.data = []
		for (var c = 0; c < this.numberOfChannels; c++) {
			this.data[c] = data.subarray(c * this.length, (c + 1) * this.length);
		}
	}
	//if array - parse channeled data
	else if (Array.isArray(data)) {
		//if separated data passed already - send sub-arrays to channels
		if (data[0] instanceof Object) {
			if (channels == null) this.numberOfChannels = data.length;
			this.length = data[0].length;
			this.data = []
			for (var c = 0; c < this.numberOfChannels; c++ ) {
				this.data[c] = (!isForcedType && ((data[c] instanceof Float32Array) || (data[c] instanceof Float64Array))) ? data[c] : new floatArray(data[c])
			}
		}
		//plain array passed - split array equipartially
		else {
			this.length = Math.floor(data.length / this.numberOfChannels);
			this.data = []
			for (var c = 0; c < this.numberOfChannels; c++) {
				this.data[c] = new floatArray(data.slice(c * this.length, (c + 1) * this.length))
			}
		}
	}
	//if ndarray, typedarray or other data-holder passed - redirect plain databuffer
	else if (data && (data.data || data.buffer)) {
		return new AudioBuffer(this.numberOfChannels, data.data || data.buffer, this.sampleRate);
	}
	//if other - unable to parse arguments
	else {
		throw Error('Failed to create buffer: check provided arguments');
	}


	//for browser - return WAA buffer, no sub-buffering allowed
	if (isWAA) {
		//create WAA buffer
		var audioBuffer = ctx.createBuffer(this.numberOfChannels, this.length, this.sampleRate);

		//fill channels
		for (var c = 0; c < this.numberOfChannels; c++) {
			audioBuffer.getChannelData(c).set(this.getChannelData(c));
		}

		return audioBuffer;
	}

	this.duration = this.length / this.sampleRate;
}


/**
 * Default params
 */
AudioBuffer.prototype.numberOfChannels = 2;
AudioBuffer.prototype.sampleRate = context.sampleRate || 44100;


/**
 * Return data associated with the channel.
 *
 * @return {Array} Array containing the data
 */
AudioBuffer.prototype.getChannelData = function (channel) {
	//FIXME: ponder on this, whether we really need that rigorous check, it may affect performance
	if (channel >= this.numberOfChannels || channel < 0 || channel == null) throw Error('Cannot getChannelData: channel number (' + channel + ') exceeds number of channels (' + this.numberOfChannels + ')');

	return this.data[channel]
};


/**
 * Place data to the destination buffer, starting from the position
 */
AudioBuffer.prototype.copyFromChannel = function (destination, channelNumber, startInChannel) {
	if (startInChannel == null) startInChannel = 0;
	var data = this.data[channelNumber]
	for (var i = startInChannel, j = 0; i < this.length && j < destination.length; i++, j++) {
		destination[j] = data[i];
	}
}


/**
 * Place data from the source to the channel, starting (in self) from the position
 * Clone of WAAudioBuffer
 */
AudioBuffer.prototype.copyToChannel = function (source, channelNumber, startInChannel) {
	var data = this.data[channelNumber]

	if (!startInChannel) startInChannel = 0;

	for (var i = startInChannel, j = 0; i < this.length && j < source.length; i++, j++) {
		data[i] = source[j];
	}
};


},{"audio-context":92,"buffer-to-arraybuffer":94,"is-audio-buffer":264,"is-browser":265,"is-buffer":266,"is-plain-obj":268}],89:[function(require,module,exports){
/**
 * @module  audio-buffer-utils
 */

'use strict'

require('typedarray-methods')
var AudioBuffer = require('audio-buffer')
var isAudioBuffer = require('is-audio-buffer')
var isBrowser = require('is-browser')
var nidx = require('negative-index')
var clamp = require('clamp')
var context = require('audio-context')

module.exports = {
	create: create,
	copy: copy,
	shallow: shallow,
	clone: clone,
	reverse: reverse,
	invert: invert,
	zero: zero,
	noise: noise,
	equal: equal,
	fill: fill,
	slice: slice,
	concat: concat,
	resize: resize,
	pad: pad,
	padLeft: padLeft,
	padRight: padRight,
	rotate: rotate,
	shift: shift,
	normalize: normalize,
	removeStatic: removeStatic,
	trim: trim,
	trimLeft: trimLeft,
	trimRight: trimRight,
	mix: mix,
	size: size,
	data: data,
	subbuffer: subbuffer
}


/**
 * Create buffer from any argument
 */
function create (len, channels, rate, options) {
	if (!options) options = {}
	return new AudioBuffer(channels, len, rate, options);
}


/**
 * Copy data from buffer A to buffer B
 */
function copy (from, to, offset) {
	validate(from);
	validate(to);

	offset = offset || 0;

	for (var channel = 0, l = Math.min(from.numberOfChannels, to.numberOfChannels); channel < l; channel++) {
		to.getChannelData(channel).set(from.getChannelData(channel), offset);
	}

	return to;
}


/**
 * Assert argument is AudioBuffer, throw error otherwise.
 */
function validate (buffer) {
	if (!isAudioBuffer(buffer)) throw new Error('Argument should be an AudioBuffer instance.');
}



/**
 * Create a buffer with the same characteristics as inBuffer, without copying
 * the data. Contents of resulting buffer are undefined.
 */
function shallow (buffer) {
	validate(buffer);

	//workaround for faster browser creation
	//avoid extra checks & copying inside of AudioBuffer class
	if (isBrowser) {
		return context().createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
	}

	return create(buffer.length, buffer.numberOfChannels, buffer.sampleRate);
}


/**
 * Create clone of a buffer
 */
function clone (buffer) {
	return copy(buffer, shallow(buffer));
}


/**
 * Reverse samples in each channel
 */
function reverse (buffer, target, start, end) {
	validate(buffer);

	//if target buffer is passed
	if (!isAudioBuffer(target) && target != null) {
		end = start;
		start = target;
		target = null;
	}

	if (target) {
		validate(target);
		copy(buffer, target);
	}
	else {
		target = buffer;
	}

	start = start == null ? 0 : nidx(start, buffer.length);
	end = end == null ? buffer.length : nidx(end, buffer.length);

	for (var i = 0, c = target.numberOfChannels; i < c; ++i) {
		target.getChannelData(i).subarray(start, end).reverse();
	}

	return target;
}


/**
 * Invert amplitude of samples in each channel
 */
function invert (buffer, target, start, end) {
	//if target buffer is passed
	if (!isAudioBuffer(target) && target != null) {
		end = start;
		start = target;
		target = null;
	}

	return fill(buffer, target, function (sample) { return -sample; }, start, end);
}


/**
 * Fill with zeros
 */
function zero (buffer, target, start, end) {
	return fill(buffer, target, 0, start, end);
}


/**
 * Fill with white noise
 */
function noise (buffer, target, start, end) {
	return fill(buffer, target, function (sample) { return Math.random() * 2 - 1; }, start, end);
}


/**
 * Test whether two buffers are the same
 */
function equal (bufferA, bufferB) {
	//walk by all the arguments
	if (arguments.length > 2) {
		for (var i = 0, l = arguments.length - 1; i < l; i++) {
			if (!equal(arguments[i], arguments[i + 1])) return false;
		}
		return true;
	}

	validate(bufferA);
	validate(bufferB);

	if (bufferA.length !== bufferB.length || bufferA.numberOfChannels !== bufferB.numberOfChannels) return false;

	for (var channel = 0; channel < bufferA.numberOfChannels; channel++) {
		var dataA = bufferA.getChannelData(channel);
		var dataB = bufferB.getChannelData(channel);

		for (var i = 0; i < dataA.length; i++) {
			if (dataA[i] !== dataB[i]) return false;
		}
	}

	return true;
}



/**
 * Generic in-place fill/transform
 */
function fill (buffer, target, value, start, end) {
	validate(buffer);

	//if target buffer is passed
	if (!isAudioBuffer(target) && target != null) {
		//target is bad argument
		if (typeof value == 'function') {
			target = null;
		}
		else {
			end = start;
			start = value;
			value = target;
			target = null;
		}
	}

	if (target) {
		validate(target);
	}
	else {
		target = buffer;
	}

	//resolve optional start/end args
	start = start == null ? 0 : nidx(start, buffer.length);
	end = end == null ? buffer.length : nidx(end, buffer.length);
	//resolve type of value
	if (!(value instanceof Function)) {
		for (var channel = 0, c = buffer.numberOfChannels; channel < c; channel++) {
			var targetData = target.getChannelData(channel);
			for (var i = start; i < end; i++) {
				targetData[i] = value
			}
		}
	}
	else {
		for (var channel = 0, c = buffer.numberOfChannels; channel < c; channel++) {
			var data = buffer.getChannelData(channel),
				targetData = target.getChannelData(channel);
			for (var i = start; i < end; i++) {
				targetData[i] = value.call(buffer, data[i], i, channel, data);
			}
		}
	}

	return target;
}


/**
 * Return sliced buffer
 */
function slice (buffer, start, end) {
	validate(buffer);

	start = start == null ? 0 : nidx(start, buffer.length);
	end = end == null ? buffer.length : nidx(end, buffer.length);

	var data = [];
	for (var channel = 0; channel < buffer.numberOfChannels; channel++) {
		var channelData = buffer.getChannelData(channel)
		data.push(channelData.slice(start, end));
	}
	return create(data, buffer.numberOfChannels, buffer.sampleRate);
}

/**
 * Create handle for a buffer from subarrays
 */
function subbuffer (buffer, start, end) {
	validate(buffer);

	start = start == null ? 0 : nidx(start, buffer.length);
	end = end == null ? buffer.length : nidx(end, buffer.length);

	var data = [];
	for (var channel = 0; channel < buffer.numberOfChannels; channel++) {
		var channelData = buffer.getChannelData(channel)
		data.push(channelData.subarray(start, end));
	}
	return create(data, buffer.numberOfChannels, buffer.sampleRate, {isWAA: false});
}

/**
 * Concat buffer with other buffer(s)
 */
function concat () {
	var list = []

	for (var i = 0, l = arguments.length; i < l; i++) {
		var arg = arguments[i]
		if (Array.isArray(arg)) {
			for (var j = 0; j < arg.length; j++) {
				list.push(arg[j])
			}
		}
		else {
			list.push(arg)
		}
	}

	var channels = 1;
	var length = 0;
	//FIXME: there might be required more thoughtful resampling, but now I'm lazy sry :(
	var sampleRate = 0;

	for (var i = 0; i < list.length; i++) {
		var buf = list[i]
		validate(buf)
		length += buf.length
		channels = Math.max(buf.numberOfChannels, channels)
		sampleRate = Math.max(buf.sampleRate, sampleRate)
	}

	var data = [];
	for (var channel = 0; channel < channels; channel++) {
		var channelData = new Float32Array(length), offset = 0

		for (var i = 0; i < list.length; i++) {
			var buf = list[i]
			if (channel < buf.numberOfChannels) {
				channelData.set(buf.getChannelData(channel), offset);
			}
			offset += buf.length
		}

		data.push(channelData);
	}

	return create(data, channels, sampleRate);
}


/**
 * Change the length of the buffer, by trimming or filling with zeros
 */
function resize (buffer, length) {
	validate(buffer);

	if (length < buffer.length) return slice(buffer, 0, length);

	return concat(buffer, create(length - buffer.length, buffer.numberOfChannels));
}


/**
 * Pad buffer to required size
 */
function pad (a, b, value) {
	var buffer, length;

	if (typeof a === 'number') {
		buffer = b;
		length = a;
	} else {
		buffer = a;
		length = b;
	}

	value = value || 0;

	validate(buffer);

	//no need to pad
	if (length < buffer.length) return buffer;

	//left-pad
	if (buffer === b) {
		return concat(fill(create(length - buffer.length, buffer.numberOfChannels), value), buffer);
	}

	//right-pad
	return concat(buffer, fill(create(length - buffer.length, buffer.numberOfChannels), value));
}
function padLeft (data, len, value) {
	return pad(len, data, value)
}
function padRight (data, len, value) {
	return pad(data, len, value)
}



/**
 * Shift content of the buffer in circular fashion
 */
function rotate (buffer, offset) {
	validate(buffer);

	for (var channel = 0; channel < buffer.numberOfChannels; channel++) {
		var cData = buffer.getChannelData(channel);
		var srcData = cData.slice();
		for (var i = 0, l = cData.length, idx; i < l; i++) {
			idx = (offset + (offset + i < 0 ? l + i : i )) % l;
			cData[idx] = srcData[i];
		}
	}

	return buffer;
}


/**
 * Shift content of the buffer
 */
function shift (buffer, offset) {
	validate(buffer);

	for (var channel = 0; channel < buffer.numberOfChannels; channel++) {
		var cData = buffer.getChannelData(channel);
		if (offset > 0) {
			for (var i = cData.length - offset; i--;) {
				cData[i + offset] = cData[i];
			}
		}
		else {
			for (var i = -offset, l = cData.length - offset; i < l; i++) {
				cData[i + offset] = cData[i] || 0;
			}
		}
	}

	return buffer;
}


/**
 * Normalize buffer by the maximum value,
 * limit values by the -1..1 range
 */
function normalize (buffer, target, start, end) {
	//resolve optional target arg
	if (!isAudioBuffer(target)) {
		end = start;
		start = target;
		target = null;
	}

	start = start == null ? 0 : nidx(start, buffer.length);
	end = end == null ? buffer.length : nidx(end, buffer.length);

	//for every channel bring it to max-min amplitude range
	var max = 0

	for (var c = 0; c < buffer.numberOfChannels; c++) {
		var data = buffer.getChannelData(c)
		for (var i = start; i < end; i++) {
			max = Math.max(Math.abs(data[i]), max)
		}
	}

	var amp = Math.max(1 / max, 1)

	return fill(buffer, target, function (value, i, ch) {
		return clamp(value * amp, -1, 1)
	}, start, end);
}

/**
 * remove DC offset
 */
function removeStatic (buffer, target, start, end) {
	var means = mean(buffer, start, end)

	return fill(buffer, target, function (value, i, ch) {
		return value - means[ch];
	}, start, end);
}

/**
 * Get average level per-channel
 */
function mean (buffer, start, end) {
	validate(buffer)

	start = start == null ? 0 : nidx(start, buffer.length);
	end = end == null ? buffer.length : nidx(end, buffer.length);

	if (end - start < 1) return []

	var result = []

	for (var c = 0; c < buffer.numberOfChannels; c++) {
		var sum = 0
		var data = buffer.getChannelData(c)
		for (var i = start; i < end; i++) {
			sum += data[i]
		}
		result.push(sum / (end - start))
	}

	return result
}


/**
 * Trim sound (remove zeros from the beginning and the end)
 */
function trim (buffer, level) {
	return trimInternal(buffer, level, true, true);
}

function trimLeft (buffer, level) {
	return trimInternal(buffer, level, true, false);
}

function trimRight (buffer, level) {
	return trimInternal(buffer, level, false, true);
}

function trimInternal(buffer, level, trimLeft, trimRight) {
	validate(buffer);

	level = (level == null) ? 0 : Math.abs(level);

	var start, end;

	if (trimLeft) {
		start = buffer.length;
		//FIXME: replace with indexOF
		for (var channel = 0, c = buffer.numberOfChannels; channel < c; channel++) {
			var data = buffer.getChannelData(channel);
			for (var i = 0; i < data.length; i++) {
				if (i > start) break;
				if (Math.abs(data[i]) > level) {
					start = i;
					break;
				}
			}
		}
	} else {
		start = 0;
	}

	if (trimRight) {
		end = 0;
		//FIXME: replace with lastIndexOf
		for (var channel = 0, c = buffer.numberOfChannels; channel < c; channel++) {
			var data = buffer.getChannelData(channel);
			for (var i = data.length - 1; i >= 0; i--) {
				if (i < end) break;
				if (Math.abs(data[i]) > level) {
					end = i + 1;
					break;
				}
			}
		}
	} else {
		end = buffer.length;
	}

	return slice(buffer, start, end);
}


/**
 * Mix current buffer with the other one.
 * The reason to modify bufferA instead of returning the new buffer
 * is reduced amount of calculations and flexibility.
 * If required, the cloning can be done before mixing, which will be the same.
 */
function mix (bufferA, bufferB, ratio, offset) {
	validate(bufferA);
	validate(bufferB);

	if (ratio == null) ratio = 0.5;
	var fn = ratio instanceof Function ? ratio : function (a, b) {
		return a * (1 - ratio) + b * ratio;
	};

	if (offset == null) offset = 0;
	else if (offset < 0) offset += bufferA.length;

	for (var channel = 0; channel < bufferA.numberOfChannels; channel++) {
		var aData = bufferA.getChannelData(channel);
		var bData = bufferB.getChannelData(channel);

		for (var i = offset, j = 0; i < bufferA.length && j < bufferB.length; i++, j++) {
			aData[i] = fn.call(bufferA, aData[i], bData[j], j, channel);
		}
	}

	return bufferA;
}


/**
 * Size of a buffer, in bytes
 */
function size (buffer) {
	validate(buffer);

	return buffer.numberOfChannels * buffer.getChannelData(0).byteLength;
}


/**
 * Return array with buffer’s per-channel data
 */
function data (buffer, data) {
	validate(buffer);

	//ensure output data array, if not defined
	data = data || [];

	//transfer data per-channel
	for (var channel = 0; channel < buffer.numberOfChannels; channel++) {
		if (ArrayBuffer.isView(data[channel])) {
			data[channel].set(buffer.getChannelData(channel));
		}
		else {
			data[channel] = buffer.getChannelData(channel);
		}
	}

	return data;
}

},{"audio-buffer":90,"audio-context":92,"clamp":95,"is-audio-buffer":264,"is-browser":265,"negative-index":270,"typedarray-methods":290}],90:[function(require,module,exports){
arguments[4][88][0].apply(exports,arguments)
},{"audio-context":92,"buffer-to-arraybuffer":94,"dup":88,"is-audio-buffer":264,"is-browser":265,"is-buffer":266,"is-plain-obj":268}],91:[function(require,module,exports){
/**
 * AudioBuffer class
 *
 * @module audio-buffer/buffer
 */
'use strict'

var getContext = require('audio-context')

module.exports = AudioBuffer


/**
 * @constructor
 */
function AudioBuffer (context, options) {
	if (!(this instanceof AudioBuffer)) return new AudioBuffer(context, options);

	//if no options passed
	if (!options) {
		options = context
		context = options && options.context
	}

	if (!options) options = {}

	if (context === undefined) context = getContext()

	//detect params
	if (options.numberOfChannels == null) {
		options.numberOfChannels = 1
	}
	if (options.sampleRate == null) {
		options.sampleRate = context && context.sampleRate || this.sampleRate
	}
	if (options.length == null) {
		if (options.duration != null) {
			options.length = options.duration * options.sampleRate
		}
		else {
			options.length = 1
		}
	}

	//if existing context
	if (context && context.createBuffer) {
		//create WAA buffer
		return context.createBuffer(options.numberOfChannels, Math.ceil(options.length), options.sampleRate)
	}

	//exposed properties
	this.length = Math.ceil(options.length)
	this.numberOfChannels = options.numberOfChannels
	this.sampleRate = options.sampleRate
	this.duration = this.length / this.sampleRate

	//data is stored as a planar sequence
	this._data = new Float32Array(this.length * this.numberOfChannels)

	//channels data is cached as subarrays
	this._channelData = []
	for (var c = 0; c < this.numberOfChannels; c++) {
		this._channelData.push(this._data.subarray(c * this.length, (c+1) * this.length ))
	}
}


/**
 * Default params
 */
AudioBuffer.prototype.numberOfChannels = 1;
AudioBuffer.prototype.sampleRate = 44100;


/**
 * Return data associated with the channel.
 *
 * @return {Array} Array containing the data
 */
AudioBuffer.prototype.getChannelData = function (channel) {
	if (channel >= this.numberOfChannels || channel < 0 || channel == null) throw Error('Cannot getChannelData: channel number (' + channel + ') exceeds number of channels (' + this.numberOfChannels + ')');

	return this._channelData[channel]
};


/**
 * Place data to the destination buffer, starting from the position
 */
AudioBuffer.prototype.copyFromChannel = function (destination, channelNumber, startInChannel) {
	if (startInChannel == null) startInChannel = 0;
	var data = this._channelData[channelNumber]
	for (var i = startInChannel, j = 0; i < this.length && j < destination.length; i++, j++) {
		destination[j] = data[i];
	}
}


/**
 * Place data from the source to the channel, starting (in self) from the position
 */
AudioBuffer.prototype.copyToChannel = function (source, channelNumber, startInChannel) {
	var data = this._channelData[channelNumber]

	if (!startInChannel) startInChannel = 0;

	for (var i = startInChannel, j = 0; i < this.length && j < source.length; i++, j++) {
		data[i] = source[j];
	}
};


},{"audio-context":92}],92:[function(require,module,exports){
'use strict'

var cache = {}

module.exports = function getContext (options) {
	if (typeof window === 'undefined') return null
	
	var OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext
	var Context = window.AudioContext || window.webkitAudioContext
	
	if (!Context) return null

	if (typeof options === 'number') {
		options = {sampleRate: options}
	}

	var sampleRate = options && options.sampleRate


	if (options && options.offline) {
		if (!OfflineContext) return null

		return new OfflineContext(options.channels || 2, options.length, sampleRate || 44100)
	}


	//cache by sampleRate, rather strong guess
	var ctx = cache[sampleRate]

	if (ctx) return ctx

	//several versions of firefox have issues with the
	//constructor argument
	//see: https://bugzilla.mozilla.org/show_bug.cgi?id=1361475
	try {
		ctx = new Context(options)
	}
	catch (err) {
		ctx = new Context()
	}
	cache[ctx.sampleRate] = cache[sampleRate] = ctx

	return ctx
}

},{}],93:[function(require,module,exports){
(function (process,global){
/* @preserve
 * The MIT License (MIT)
 * 
 * Copyright (c) 2013-2018 Petka Antonov
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 * 
 */
/**
 * bluebird build version 3.5.4
 * Features enabled: core, race, call_get, generators, map, nodeify, promisify, props, reduce, settle, some, using, timers, filter, any, each
*/
!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.Promise=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof _dereq_=="function"&&_dereq_;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof _dereq_=="function"&&_dereq_;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise) {
var SomePromiseArray = Promise._SomePromiseArray;
function any(promises) {
    var ret = new SomePromiseArray(promises);
    var promise = ret.promise();
    ret.setHowMany(1);
    ret.setUnwrap();
    ret.init();
    return promise;
}

Promise.any = function (promises) {
    return any(promises);
};

Promise.prototype.any = function () {
    return any(this);
};

};

},{}],2:[function(_dereq_,module,exports){
"use strict";
var firstLineError;
try {throw new Error(); } catch (e) {firstLineError = e;}
var schedule = _dereq_("./schedule");
var Queue = _dereq_("./queue");
var util = _dereq_("./util");

function Async() {
    this._customScheduler = false;
    this._isTickUsed = false;
    this._lateQueue = new Queue(16);
    this._normalQueue = new Queue(16);
    this._haveDrainedQueues = false;
    this._trampolineEnabled = true;
    var self = this;
    this.drainQueues = function () {
        self._drainQueues();
    };
    this._schedule = schedule;
}

Async.prototype.setScheduler = function(fn) {
    var prev = this._schedule;
    this._schedule = fn;
    this._customScheduler = true;
    return prev;
};

Async.prototype.hasCustomScheduler = function() {
    return this._customScheduler;
};

Async.prototype.enableTrampoline = function() {
    this._trampolineEnabled = true;
};

Async.prototype.disableTrampolineIfNecessary = function() {
    if (util.hasDevTools) {
        this._trampolineEnabled = false;
    }
};

Async.prototype.haveItemsQueued = function () {
    return this._isTickUsed || this._haveDrainedQueues;
};


Async.prototype.fatalError = function(e, isNode) {
    if (isNode) {
        process.stderr.write("Fatal " + (e instanceof Error ? e.stack : e) +
            "\n");
        process.exit(2);
    } else {
        this.throwLater(e);
    }
};

Async.prototype.throwLater = function(fn, arg) {
    if (arguments.length === 1) {
        arg = fn;
        fn = function () { throw arg; };
    }
    if (typeof setTimeout !== "undefined") {
        setTimeout(function() {
            fn(arg);
        }, 0);
    } else try {
        this._schedule(function() {
            fn(arg);
        });
    } catch (e) {
        throw new Error("No async scheduler available\u000a\u000a    See http://goo.gl/MqrFmX\u000a");
    }
};

function AsyncInvokeLater(fn, receiver, arg) {
    this._lateQueue.push(fn, receiver, arg);
    this._queueTick();
}

function AsyncInvoke(fn, receiver, arg) {
    this._normalQueue.push(fn, receiver, arg);
    this._queueTick();
}

function AsyncSettlePromises(promise) {
    this._normalQueue._pushOne(promise);
    this._queueTick();
}

if (!util.hasDevTools) {
    Async.prototype.invokeLater = AsyncInvokeLater;
    Async.prototype.invoke = AsyncInvoke;
    Async.prototype.settlePromises = AsyncSettlePromises;
} else {
    Async.prototype.invokeLater = function (fn, receiver, arg) {
        if (this._trampolineEnabled) {
            AsyncInvokeLater.call(this, fn, receiver, arg);
        } else {
            this._schedule(function() {
                setTimeout(function() {
                    fn.call(receiver, arg);
                }, 100);
            });
        }
    };

    Async.prototype.invoke = function (fn, receiver, arg) {
        if (this._trampolineEnabled) {
            AsyncInvoke.call(this, fn, receiver, arg);
        } else {
            this._schedule(function() {
                fn.call(receiver, arg);
            });
        }
    };

    Async.prototype.settlePromises = function(promise) {
        if (this._trampolineEnabled) {
            AsyncSettlePromises.call(this, promise);
        } else {
            this._schedule(function() {
                promise._settlePromises();
            });
        }
    };
}

function _drainQueue(queue) {
    while (queue.length() > 0) {
        _drainQueueStep(queue);
    }
}

function _drainQueueStep(queue) {
    var fn = queue.shift();
    if (typeof fn !== "function") {
        fn._settlePromises();
    } else {
        var receiver = queue.shift();
        var arg = queue.shift();
        fn.call(receiver, arg);
    }
}

Async.prototype._drainQueues = function () {
    _drainQueue(this._normalQueue);
    this._reset();
    this._haveDrainedQueues = true;
    _drainQueue(this._lateQueue);
};

Async.prototype._queueTick = function () {
    if (!this._isTickUsed) {
        this._isTickUsed = true;
        this._schedule(this.drainQueues);
    }
};

Async.prototype._reset = function () {
    this._isTickUsed = false;
};

module.exports = Async;
module.exports.firstLineError = firstLineError;

},{"./queue":26,"./schedule":29,"./util":36}],3:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise, INTERNAL, tryConvertToPromise, debug) {
var calledBind = false;
var rejectThis = function(_, e) {
    this._reject(e);
};

var targetRejected = function(e, context) {
    context.promiseRejectionQueued = true;
    context.bindingPromise._then(rejectThis, rejectThis, null, this, e);
};

var bindingResolved = function(thisArg, context) {
    if (((this._bitField & 50397184) === 0)) {
        this._resolveCallback(context.target);
    }
};

var bindingRejected = function(e, context) {
    if (!context.promiseRejectionQueued) this._reject(e);
};

Promise.prototype.bind = function (thisArg) {
    if (!calledBind) {
        calledBind = true;
        Promise.prototype._propagateFrom = debug.propagateFromFunction();
        Promise.prototype._boundValue = debug.boundValueFunction();
    }
    var maybePromise = tryConvertToPromise(thisArg);
    var ret = new Promise(INTERNAL);
    ret._propagateFrom(this, 1);
    var target = this._target();
    ret._setBoundTo(maybePromise);
    if (maybePromise instanceof Promise) {
        var context = {
            promiseRejectionQueued: false,
            promise: ret,
            target: target,
            bindingPromise: maybePromise
        };
        target._then(INTERNAL, targetRejected, undefined, ret, context);
        maybePromise._then(
            bindingResolved, bindingRejected, undefined, ret, context);
        ret._setOnCancel(maybePromise);
    } else {
        ret._resolveCallback(target);
    }
    return ret;
};

Promise.prototype._setBoundTo = function (obj) {
    if (obj !== undefined) {
        this._bitField = this._bitField | 2097152;
        this._boundTo = obj;
    } else {
        this._bitField = this._bitField & (~2097152);
    }
};

Promise.prototype._isBound = function () {
    return (this._bitField & 2097152) === 2097152;
};

Promise.bind = function (thisArg, value) {
    return Promise.resolve(value).bind(thisArg);
};
};

},{}],4:[function(_dereq_,module,exports){
"use strict";
var old;
if (typeof Promise !== "undefined") old = Promise;
function noConflict() {
    try { if (Promise === bluebird) Promise = old; }
    catch (e) {}
    return bluebird;
}
var bluebird = _dereq_("./promise")();
bluebird.noConflict = noConflict;
module.exports = bluebird;

},{"./promise":22}],5:[function(_dereq_,module,exports){
"use strict";
var cr = Object.create;
if (cr) {
    var callerCache = cr(null);
    var getterCache = cr(null);
    callerCache[" size"] = getterCache[" size"] = 0;
}

module.exports = function(Promise) {
var util = _dereq_("./util");
var canEvaluate = util.canEvaluate;
var isIdentifier = util.isIdentifier;

var getMethodCaller;
var getGetter;
if (!true) {
var makeMethodCaller = function (methodName) {
    return new Function("ensureMethod", "                                    \n\
        return function(obj) {                                               \n\
            'use strict'                                                     \n\
            var len = this.length;                                           \n\
            ensureMethod(obj, 'methodName');                                 \n\
            switch(len) {                                                    \n\
                case 1: return obj.methodName(this[0]);                      \n\
                case 2: return obj.methodName(this[0], this[1]);             \n\
                case 3: return obj.methodName(this[0], this[1], this[2]);    \n\
                case 0: return obj.methodName();                             \n\
                default:                                                     \n\
                    return obj.methodName.apply(obj, this);                  \n\
            }                                                                \n\
        };                                                                   \n\
        ".replace(/methodName/g, methodName))(ensureMethod);
};

var makeGetter = function (propertyName) {
    return new Function("obj", "                                             \n\
        'use strict';                                                        \n\
        return obj.propertyName;                                             \n\
        ".replace("propertyName", propertyName));
};

var getCompiled = function(name, compiler, cache) {
    var ret = cache[name];
    if (typeof ret !== "function") {
        if (!isIdentifier(name)) {
            return null;
        }
        ret = compiler(name);
        cache[name] = ret;
        cache[" size"]++;
        if (cache[" size"] > 512) {
            var keys = Object.keys(cache);
            for (var i = 0; i < 256; ++i) delete cache[keys[i]];
            cache[" size"] = keys.length - 256;
        }
    }
    return ret;
};

getMethodCaller = function(name) {
    return getCompiled(name, makeMethodCaller, callerCache);
};

getGetter = function(name) {
    return getCompiled(name, makeGetter, getterCache);
};
}

function ensureMethod(obj, methodName) {
    var fn;
    if (obj != null) fn = obj[methodName];
    if (typeof fn !== "function") {
        var message = "Object " + util.classString(obj) + " has no method '" +
            util.toString(methodName) + "'";
        throw new Promise.TypeError(message);
    }
    return fn;
}

function caller(obj) {
    var methodName = this.pop();
    var fn = ensureMethod(obj, methodName);
    return fn.apply(obj, this);
}
Promise.prototype.call = function (methodName) {
    var args = [].slice.call(arguments, 1);;
    if (!true) {
        if (canEvaluate) {
            var maybeCaller = getMethodCaller(methodName);
            if (maybeCaller !== null) {
                return this._then(
                    maybeCaller, undefined, undefined, args, undefined);
            }
        }
    }
    args.push(methodName);
    return this._then(caller, undefined, undefined, args, undefined);
};

function namedGetter(obj) {
    return obj[this];
}
function indexedGetter(obj) {
    var index = +this;
    if (index < 0) index = Math.max(0, index + obj.length);
    return obj[index];
}
Promise.prototype.get = function (propertyName) {
    var isIndex = (typeof propertyName === "number");
    var getter;
    if (!isIndex) {
        if (canEvaluate) {
            var maybeGetter = getGetter(propertyName);
            getter = maybeGetter !== null ? maybeGetter : namedGetter;
        } else {
            getter = namedGetter;
        }
    } else {
        getter = indexedGetter;
    }
    return this._then(getter, undefined, undefined, propertyName, undefined);
};
};

},{"./util":36}],6:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise, PromiseArray, apiRejection, debug) {
var util = _dereq_("./util");
var tryCatch = util.tryCatch;
var errorObj = util.errorObj;
var async = Promise._async;

Promise.prototype["break"] = Promise.prototype.cancel = function() {
    if (!debug.cancellation()) return this._warn("cancellation is disabled");

    var promise = this;
    var child = promise;
    while (promise._isCancellable()) {
        if (!promise._cancelBy(child)) {
            if (child._isFollowing()) {
                child._followee().cancel();
            } else {
                child._cancelBranched();
            }
            break;
        }

        var parent = promise._cancellationParent;
        if (parent == null || !parent._isCancellable()) {
            if (promise._isFollowing()) {
                promise._followee().cancel();
            } else {
                promise._cancelBranched();
            }
            break;
        } else {
            if (promise._isFollowing()) promise._followee().cancel();
            promise._setWillBeCancelled();
            child = promise;
            promise = parent;
        }
    }
};

Promise.prototype._branchHasCancelled = function() {
    this._branchesRemainingToCancel--;
};

Promise.prototype._enoughBranchesHaveCancelled = function() {
    return this._branchesRemainingToCancel === undefined ||
           this._branchesRemainingToCancel <= 0;
};

Promise.prototype._cancelBy = function(canceller) {
    if (canceller === this) {
        this._branchesRemainingToCancel = 0;
        this._invokeOnCancel();
        return true;
    } else {
        this._branchHasCancelled();
        if (this._enoughBranchesHaveCancelled()) {
            this._invokeOnCancel();
            return true;
        }
    }
    return false;
};

Promise.prototype._cancelBranched = function() {
    if (this._enoughBranchesHaveCancelled()) {
        this._cancel();
    }
};

Promise.prototype._cancel = function() {
    if (!this._isCancellable()) return;
    this._setCancelled();
    async.invoke(this._cancelPromises, this, undefined);
};

Promise.prototype._cancelPromises = function() {
    if (this._length() > 0) this._settlePromises();
};

Promise.prototype._unsetOnCancel = function() {
    this._onCancelField = undefined;
};

Promise.prototype._isCancellable = function() {
    return this.isPending() && !this._isCancelled();
};

Promise.prototype.isCancellable = function() {
    return this.isPending() && !this.isCancelled();
};

Promise.prototype._doInvokeOnCancel = function(onCancelCallback, internalOnly) {
    if (util.isArray(onCancelCallback)) {
        for (var i = 0; i < onCancelCallback.length; ++i) {
            this._doInvokeOnCancel(onCancelCallback[i], internalOnly);
        }
    } else if (onCancelCallback !== undefined) {
        if (typeof onCancelCallback === "function") {
            if (!internalOnly) {
                var e = tryCatch(onCancelCallback).call(this._boundValue());
                if (e === errorObj) {
                    this._attachExtraTrace(e.e);
                    async.throwLater(e.e);
                }
            }
        } else {
            onCancelCallback._resultCancelled(this);
        }
    }
};

Promise.prototype._invokeOnCancel = function() {
    var onCancelCallback = this._onCancel();
    this._unsetOnCancel();
    async.invoke(this._doInvokeOnCancel, this, onCancelCallback);
};

Promise.prototype._invokeInternalOnCancel = function() {
    if (this._isCancellable()) {
        this._doInvokeOnCancel(this._onCancel(), true);
        this._unsetOnCancel();
    }
};

Promise.prototype._resultCancelled = function() {
    this.cancel();
};

};

},{"./util":36}],7:[function(_dereq_,module,exports){
"use strict";
module.exports = function(NEXT_FILTER) {
var util = _dereq_("./util");
var getKeys = _dereq_("./es5").keys;
var tryCatch = util.tryCatch;
var errorObj = util.errorObj;

function catchFilter(instances, cb, promise) {
    return function(e) {
        var boundTo = promise._boundValue();
        predicateLoop: for (var i = 0; i < instances.length; ++i) {
            var item = instances[i];

            if (item === Error ||
                (item != null && item.prototype instanceof Error)) {
                if (e instanceof item) {
                    return tryCatch(cb).call(boundTo, e);
                }
            } else if (typeof item === "function") {
                var matchesPredicate = tryCatch(item).call(boundTo, e);
                if (matchesPredicate === errorObj) {
                    return matchesPredicate;
                } else if (matchesPredicate) {
                    return tryCatch(cb).call(boundTo, e);
                }
            } else if (util.isObject(e)) {
                var keys = getKeys(item);
                for (var j = 0; j < keys.length; ++j) {
                    var key = keys[j];
                    if (item[key] != e[key]) {
                        continue predicateLoop;
                    }
                }
                return tryCatch(cb).call(boundTo, e);
            }
        }
        return NEXT_FILTER;
    };
}

return catchFilter;
};

},{"./es5":13,"./util":36}],8:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise) {
var longStackTraces = false;
var contextStack = [];

Promise.prototype._promiseCreated = function() {};
Promise.prototype._pushContext = function() {};
Promise.prototype._popContext = function() {return null;};
Promise._peekContext = Promise.prototype._peekContext = function() {};

function Context() {
    this._trace = new Context.CapturedTrace(peekContext());
}
Context.prototype._pushContext = function () {
    if (this._trace !== undefined) {
        this._trace._promiseCreated = null;
        contextStack.push(this._trace);
    }
};

Context.prototype._popContext = function () {
    if (this._trace !== undefined) {
        var trace = contextStack.pop();
        var ret = trace._promiseCreated;
        trace._promiseCreated = null;
        return ret;
    }
    return null;
};

function createContext() {
    if (longStackTraces) return new Context();
}

function peekContext() {
    var lastIndex = contextStack.length - 1;
    if (lastIndex >= 0) {
        return contextStack[lastIndex];
    }
    return undefined;
}
Context.CapturedTrace = null;
Context.create = createContext;
Context.deactivateLongStackTraces = function() {};
Context.activateLongStackTraces = function() {
    var Promise_pushContext = Promise.prototype._pushContext;
    var Promise_popContext = Promise.prototype._popContext;
    var Promise_PeekContext = Promise._peekContext;
    var Promise_peekContext = Promise.prototype._peekContext;
    var Promise_promiseCreated = Promise.prototype._promiseCreated;
    Context.deactivateLongStackTraces = function() {
        Promise.prototype._pushContext = Promise_pushContext;
        Promise.prototype._popContext = Promise_popContext;
        Promise._peekContext = Promise_PeekContext;
        Promise.prototype._peekContext = Promise_peekContext;
        Promise.prototype._promiseCreated = Promise_promiseCreated;
        longStackTraces = false;
    };
    longStackTraces = true;
    Promise.prototype._pushContext = Context.prototype._pushContext;
    Promise.prototype._popContext = Context.prototype._popContext;
    Promise._peekContext = Promise.prototype._peekContext = peekContext;
    Promise.prototype._promiseCreated = function() {
        var ctx = this._peekContext();
        if (ctx && ctx._promiseCreated == null) ctx._promiseCreated = this;
    };
};
return Context;
};

},{}],9:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise, Context) {
var getDomain = Promise._getDomain;
var async = Promise._async;
var Warning = _dereq_("./errors").Warning;
var util = _dereq_("./util");
var es5 = _dereq_("./es5");
var canAttachTrace = util.canAttachTrace;
var unhandledRejectionHandled;
var possiblyUnhandledRejection;
var bluebirdFramePattern =
    /[\\\/]bluebird[\\\/]js[\\\/](release|debug|instrumented)/;
var nodeFramePattern = /\((?:timers\.js):\d+:\d+\)/;
var parseLinePattern = /[\/<\(](.+?):(\d+):(\d+)\)?\s*$/;
var stackFramePattern = null;
var formatStack = null;
var indentStackFrames = false;
var printWarning;
var debugging = !!(util.env("BLUEBIRD_DEBUG") != 0 &&
                        (true ||
                         util.env("BLUEBIRD_DEBUG") ||
                         util.env("NODE_ENV") === "development"));

var warnings = !!(util.env("BLUEBIRD_WARNINGS") != 0 &&
    (debugging || util.env("BLUEBIRD_WARNINGS")));

var longStackTraces = !!(util.env("BLUEBIRD_LONG_STACK_TRACES") != 0 &&
    (debugging || util.env("BLUEBIRD_LONG_STACK_TRACES")));

var wForgottenReturn = util.env("BLUEBIRD_W_FORGOTTEN_RETURN") != 0 &&
    (warnings || !!util.env("BLUEBIRD_W_FORGOTTEN_RETURN"));

Promise.prototype.suppressUnhandledRejections = function() {
    var target = this._target();
    target._bitField = ((target._bitField & (~1048576)) |
                      524288);
};

Promise.prototype._ensurePossibleRejectionHandled = function () {
    if ((this._bitField & 524288) !== 0) return;
    this._setRejectionIsUnhandled();
    var self = this;
    setTimeout(function() {
        self._notifyUnhandledRejection();
    }, 1);
};

Promise.prototype._notifyUnhandledRejectionIsHandled = function () {
    fireRejectionEvent("rejectionHandled",
                                  unhandledRejectionHandled, undefined, this);
};

Promise.prototype._setReturnedNonUndefined = function() {
    this._bitField = this._bitField | 268435456;
};

Promise.prototype._returnedNonUndefined = function() {
    return (this._bitField & 268435456) !== 0;
};

Promise.prototype._notifyUnhandledRejection = function () {
    if (this._isRejectionUnhandled()) {
        var reason = this._settledValue();
        this._setUnhandledRejectionIsNotified();
        fireRejectionEvent("unhandledRejection",
                                      possiblyUnhandledRejection, reason, this);
    }
};

Promise.prototype._setUnhandledRejectionIsNotified = function () {
    this._bitField = this._bitField | 262144;
};

Promise.prototype._unsetUnhandledRejectionIsNotified = function () {
    this._bitField = this._bitField & (~262144);
};

Promise.prototype._isUnhandledRejectionNotified = function () {
    return (this._bitField & 262144) > 0;
};

Promise.prototype._setRejectionIsUnhandled = function () {
    this._bitField = this._bitField | 1048576;
};

Promise.prototype._unsetRejectionIsUnhandled = function () {
    this._bitField = this._bitField & (~1048576);
    if (this._isUnhandledRejectionNotified()) {
        this._unsetUnhandledRejectionIsNotified();
        this._notifyUnhandledRejectionIsHandled();
    }
};

Promise.prototype._isRejectionUnhandled = function () {
    return (this._bitField & 1048576) > 0;
};

Promise.prototype._warn = function(message, shouldUseOwnTrace, promise) {
    return warn(message, shouldUseOwnTrace, promise || this);
};

Promise.onPossiblyUnhandledRejection = function (fn) {
    var domain = getDomain();
    possiblyUnhandledRejection =
        typeof fn === "function" ? (domain === null ?
                                            fn : util.domainBind(domain, fn))
                                 : undefined;
};

Promise.onUnhandledRejectionHandled = function (fn) {
    var domain = getDomain();
    unhandledRejectionHandled =
        typeof fn === "function" ? (domain === null ?
                                            fn : util.domainBind(domain, fn))
                                 : undefined;
};

var disableLongStackTraces = function() {};
Promise.longStackTraces = function () {
    if (async.haveItemsQueued() && !config.longStackTraces) {
        throw new Error("cannot enable long stack traces after promises have been created\u000a\u000a    See http://goo.gl/MqrFmX\u000a");
    }
    if (!config.longStackTraces && longStackTracesIsSupported()) {
        var Promise_captureStackTrace = Promise.prototype._captureStackTrace;
        var Promise_attachExtraTrace = Promise.prototype._attachExtraTrace;
        var Promise_dereferenceTrace = Promise.prototype._dereferenceTrace;
        config.longStackTraces = true;
        disableLongStackTraces = function() {
            if (async.haveItemsQueued() && !config.longStackTraces) {
                throw new Error("cannot enable long stack traces after promises have been created\u000a\u000a    See http://goo.gl/MqrFmX\u000a");
            }
            Promise.prototype._captureStackTrace = Promise_captureStackTrace;
            Promise.prototype._attachExtraTrace = Promise_attachExtraTrace;
            Promise.prototype._dereferenceTrace = Promise_dereferenceTrace;
            Context.deactivateLongStackTraces();
            async.enableTrampoline();
            config.longStackTraces = false;
        };
        Promise.prototype._captureStackTrace = longStackTracesCaptureStackTrace;
        Promise.prototype._attachExtraTrace = longStackTracesAttachExtraTrace;
        Promise.prototype._dereferenceTrace = longStackTracesDereferenceTrace;
        Context.activateLongStackTraces();
        async.disableTrampolineIfNecessary();
    }
};

Promise.hasLongStackTraces = function () {
    return config.longStackTraces && longStackTracesIsSupported();
};

var fireDomEvent = (function() {
    try {
        if (typeof CustomEvent === "function") {
            var event = new CustomEvent("CustomEvent");
            util.global.dispatchEvent(event);
            return function(name, event) {
                var eventData = {
                    detail: event,
                    cancelable: true
                };
                es5.defineProperty(
                    eventData, "promise", {value: event.promise});
                es5.defineProperty(eventData, "reason", {value: event.reason});
                var domEvent = new CustomEvent(name.toLowerCase(), eventData);
                return !util.global.dispatchEvent(domEvent);
            };
        } else if (typeof Event === "function") {
            var event = new Event("CustomEvent");
            util.global.dispatchEvent(event);
            return function(name, event) {
                var domEvent = new Event(name.toLowerCase(), {
                    cancelable: true
                });
                domEvent.detail = event;
                es5.defineProperty(domEvent, "promise", {value: event.promise});
                es5.defineProperty(domEvent, "reason", {value: event.reason});
                return !util.global.dispatchEvent(domEvent);
            };
        } else {
            var event = document.createEvent("CustomEvent");
            event.initCustomEvent("testingtheevent", false, true, {});
            util.global.dispatchEvent(event);
            return function(name, event) {
                var domEvent = document.createEvent("CustomEvent");
                domEvent.initCustomEvent(name.toLowerCase(), false, true,
                    event);
                return !util.global.dispatchEvent(domEvent);
            };
        }
    } catch (e) {}
    return function() {
        return false;
    };
})();

var fireGlobalEvent = (function() {
    if (util.isNode) {
        return function() {
            return process.emit.apply(process, arguments);
        };
    } else {
        if (!util.global) {
            return function() {
                return false;
            };
        }
        return function(name) {
            var methodName = "on" + name.toLowerCase();
            var method = util.global[methodName];
            if (!method) return false;
            method.apply(util.global, [].slice.call(arguments, 1));
            return true;
        };
    }
})();

function generatePromiseLifecycleEventObject(name, promise) {
    return {promise: promise};
}

var eventToObjectGenerator = {
    promiseCreated: generatePromiseLifecycleEventObject,
    promiseFulfilled: generatePromiseLifecycleEventObject,
    promiseRejected: generatePromiseLifecycleEventObject,
    promiseResolved: generatePromiseLifecycleEventObject,
    promiseCancelled: generatePromiseLifecycleEventObject,
    promiseChained: function(name, promise, child) {
        return {promise: promise, child: child};
    },
    warning: function(name, warning) {
        return {warning: warning};
    },
    unhandledRejection: function (name, reason, promise) {
        return {reason: reason, promise: promise};
    },
    rejectionHandled: generatePromiseLifecycleEventObject
};

var activeFireEvent = function (name) {
    var globalEventFired = false;
    try {
        globalEventFired = fireGlobalEvent.apply(null, arguments);
    } catch (e) {
        async.throwLater(e);
        globalEventFired = true;
    }

    var domEventFired = false;
    try {
        domEventFired = fireDomEvent(name,
                    eventToObjectGenerator[name].apply(null, arguments));
    } catch (e) {
        async.throwLater(e);
        domEventFired = true;
    }

    return domEventFired || globalEventFired;
};

Promise.config = function(opts) {
    opts = Object(opts);
    if ("longStackTraces" in opts) {
        if (opts.longStackTraces) {
            Promise.longStackTraces();
        } else if (!opts.longStackTraces && Promise.hasLongStackTraces()) {
            disableLongStackTraces();
        }
    }
    if ("warnings" in opts) {
        var warningsOption = opts.warnings;
        config.warnings = !!warningsOption;
        wForgottenReturn = config.warnings;

        if (util.isObject(warningsOption)) {
            if ("wForgottenReturn" in warningsOption) {
                wForgottenReturn = !!warningsOption.wForgottenReturn;
            }
        }
    }
    if ("cancellation" in opts && opts.cancellation && !config.cancellation) {
        if (async.haveItemsQueued()) {
            throw new Error(
                "cannot enable cancellation after promises are in use");
        }
        Promise.prototype._clearCancellationData =
            cancellationClearCancellationData;
        Promise.prototype._propagateFrom = cancellationPropagateFrom;
        Promise.prototype._onCancel = cancellationOnCancel;
        Promise.prototype._setOnCancel = cancellationSetOnCancel;
        Promise.prototype._attachCancellationCallback =
            cancellationAttachCancellationCallback;
        Promise.prototype._execute = cancellationExecute;
        propagateFromFunction = cancellationPropagateFrom;
        config.cancellation = true;
    }
    if ("monitoring" in opts) {
        if (opts.monitoring && !config.monitoring) {
            config.monitoring = true;
            Promise.prototype._fireEvent = activeFireEvent;
        } else if (!opts.monitoring && config.monitoring) {
            config.monitoring = false;
            Promise.prototype._fireEvent = defaultFireEvent;
        }
    }
    return Promise;
};

function defaultFireEvent() { return false; }

Promise.prototype._fireEvent = defaultFireEvent;
Promise.prototype._execute = function(executor, resolve, reject) {
    try {
        executor(resolve, reject);
    } catch (e) {
        return e;
    }
};
Promise.prototype._onCancel = function () {};
Promise.prototype._setOnCancel = function (handler) { ; };
Promise.prototype._attachCancellationCallback = function(onCancel) {
    ;
};
Promise.prototype._captureStackTrace = function () {};
Promise.prototype._attachExtraTrace = function () {};
Promise.prototype._dereferenceTrace = function () {};
Promise.prototype._clearCancellationData = function() {};
Promise.prototype._propagateFrom = function (parent, flags) {
    ;
    ;
};

function cancellationExecute(executor, resolve, reject) {
    var promise = this;
    try {
        executor(resolve, reject, function(onCancel) {
            if (typeof onCancel !== "function") {
                throw new TypeError("onCancel must be a function, got: " +
                                    util.toString(onCancel));
            }
            promise._attachCancellationCallback(onCancel);
        });
    } catch (e) {
        return e;
    }
}

function cancellationAttachCancellationCallback(onCancel) {
    if (!this._isCancellable()) return this;

    var previousOnCancel = this._onCancel();
    if (previousOnCancel !== undefined) {
        if (util.isArray(previousOnCancel)) {
            previousOnCancel.push(onCancel);
        } else {
            this._setOnCancel([previousOnCancel, onCancel]);
        }
    } else {
        this._setOnCancel(onCancel);
    }
}

function cancellationOnCancel() {
    return this._onCancelField;
}

function cancellationSetOnCancel(onCancel) {
    this._onCancelField = onCancel;
}

function cancellationClearCancellationData() {
    this._cancellationParent = undefined;
    this._onCancelField = undefined;
}

function cancellationPropagateFrom(parent, flags) {
    if ((flags & 1) !== 0) {
        this._cancellationParent = parent;
        var branchesRemainingToCancel = parent._branchesRemainingToCancel;
        if (branchesRemainingToCancel === undefined) {
            branchesRemainingToCancel = 0;
        }
        parent._branchesRemainingToCancel = branchesRemainingToCancel + 1;
    }
    if ((flags & 2) !== 0 && parent._isBound()) {
        this._setBoundTo(parent._boundTo);
    }
}

function bindingPropagateFrom(parent, flags) {
    if ((flags & 2) !== 0 && parent._isBound()) {
        this._setBoundTo(parent._boundTo);
    }
}
var propagateFromFunction = bindingPropagateFrom;

function boundValueFunction() {
    var ret = this._boundTo;
    if (ret !== undefined) {
        if (ret instanceof Promise) {
            if (ret.isFulfilled()) {
                return ret.value();
            } else {
                return undefined;
            }
        }
    }
    return ret;
}

function longStackTracesCaptureStackTrace() {
    this._trace = new CapturedTrace(this._peekContext());
}

function longStackTracesAttachExtraTrace(error, ignoreSelf) {
    if (canAttachTrace(error)) {
        var trace = this._trace;
        if (trace !== undefined) {
            if (ignoreSelf) trace = trace._parent;
        }
        if (trace !== undefined) {
            trace.attachExtraTrace(error);
        } else if (!error.__stackCleaned__) {
            var parsed = parseStackAndMessage(error);
            util.notEnumerableProp(error, "stack",
                parsed.message + "\n" + parsed.stack.join("\n"));
            util.notEnumerableProp(error, "__stackCleaned__", true);
        }
    }
}

function longStackTracesDereferenceTrace() {
    this._trace = undefined;
}

function checkForgottenReturns(returnValue, promiseCreated, name, promise,
                               parent) {
    if (returnValue === undefined && promiseCreated !== null &&
        wForgottenReturn) {
        if (parent !== undefined && parent._returnedNonUndefined()) return;
        if ((promise._bitField & 65535) === 0) return;

        if (name) name = name + " ";
        var handlerLine = "";
        var creatorLine = "";
        if (promiseCreated._trace) {
            var traceLines = promiseCreated._trace.stack.split("\n");
            var stack = cleanStack(traceLines);
            for (var i = stack.length - 1; i >= 0; --i) {
                var line = stack[i];
                if (!nodeFramePattern.test(line)) {
                    var lineMatches = line.match(parseLinePattern);
                    if (lineMatches) {
                        handlerLine  = "at " + lineMatches[1] +
                            ":" + lineMatches[2] + ":" + lineMatches[3] + " ";
                    }
                    break;
                }
            }

            if (stack.length > 0) {
                var firstUserLine = stack[0];
                for (var i = 0; i < traceLines.length; ++i) {

                    if (traceLines[i] === firstUserLine) {
                        if (i > 0) {
                            creatorLine = "\n" + traceLines[i - 1];
                        }
                        break;
                    }
                }

            }
        }
        var msg = "a promise was created in a " + name +
            "handler " + handlerLine + "but was not returned from it, " +
            "see http://goo.gl/rRqMUw" +
            creatorLine;
        promise._warn(msg, true, promiseCreated);
    }
}

function deprecated(name, replacement) {
    var message = name +
        " is deprecated and will be removed in a future version.";
    if (replacement) message += " Use " + replacement + " instead.";
    return warn(message);
}

function warn(message, shouldUseOwnTrace, promise) {
    if (!config.warnings) return;
    var warning = new Warning(message);
    var ctx;
    if (shouldUseOwnTrace) {
        promise._attachExtraTrace(warning);
    } else if (config.longStackTraces && (ctx = Promise._peekContext())) {
        ctx.attachExtraTrace(warning);
    } else {
        var parsed = parseStackAndMessage(warning);
        warning.stack = parsed.message + "\n" + parsed.stack.join("\n");
    }

    if (!activeFireEvent("warning", warning)) {
        formatAndLogError(warning, "", true);
    }
}

function reconstructStack(message, stacks) {
    for (var i = 0; i < stacks.length - 1; ++i) {
        stacks[i].push("From previous event:");
        stacks[i] = stacks[i].join("\n");
    }
    if (i < stacks.length) {
        stacks[i] = stacks[i].join("\n");
    }
    return message + "\n" + stacks.join("\n");
}

function removeDuplicateOrEmptyJumps(stacks) {
    for (var i = 0; i < stacks.length; ++i) {
        if (stacks[i].length === 0 ||
            ((i + 1 < stacks.length) && stacks[i][0] === stacks[i+1][0])) {
            stacks.splice(i, 1);
            i--;
        }
    }
}

function removeCommonRoots(stacks) {
    var current = stacks[0];
    for (var i = 1; i < stacks.length; ++i) {
        var prev = stacks[i];
        var currentLastIndex = current.length - 1;
        var currentLastLine = current[currentLastIndex];
        var commonRootMeetPoint = -1;

        for (var j = prev.length - 1; j >= 0; --j) {
            if (prev[j] === currentLastLine) {
                commonRootMeetPoint = j;
                break;
            }
        }

        for (var j = commonRootMeetPoint; j >= 0; --j) {
            var line = prev[j];
            if (current[currentLastIndex] === line) {
                current.pop();
                currentLastIndex--;
            } else {
                break;
            }
        }
        current = prev;
    }
}

function cleanStack(stack) {
    var ret = [];
    for (var i = 0; i < stack.length; ++i) {
        var line = stack[i];
        var isTraceLine = "    (No stack trace)" === line ||
            stackFramePattern.test(line);
        var isInternalFrame = isTraceLine && shouldIgnore(line);
        if (isTraceLine && !isInternalFrame) {
            if (indentStackFrames && line.charAt(0) !== " ") {
                line = "    " + line;
            }
            ret.push(line);
        }
    }
    return ret;
}

function stackFramesAsArray(error) {
    var stack = error.stack.replace(/\s+$/g, "").split("\n");
    for (var i = 0; i < stack.length; ++i) {
        var line = stack[i];
        if ("    (No stack trace)" === line || stackFramePattern.test(line)) {
            break;
        }
    }
    if (i > 0 && error.name != "SyntaxError") {
        stack = stack.slice(i);
    }
    return stack;
}

function parseStackAndMessage(error) {
    var stack = error.stack;
    var message = error.toString();
    stack = typeof stack === "string" && stack.length > 0
                ? stackFramesAsArray(error) : ["    (No stack trace)"];
    return {
        message: message,
        stack: error.name == "SyntaxError" ? stack : cleanStack(stack)
    };
}

function formatAndLogError(error, title, isSoft) {
    if (typeof console !== "undefined") {
        var message;
        if (util.isObject(error)) {
            var stack = error.stack;
            message = title + formatStack(stack, error);
        } else {
            message = title + String(error);
        }
        if (typeof printWarning === "function") {
            printWarning(message, isSoft);
        } else if (typeof console.log === "function" ||
            typeof console.log === "object") {
            console.log(message);
        }
    }
}

function fireRejectionEvent(name, localHandler, reason, promise) {
    var localEventFired = false;
    try {
        if (typeof localHandler === "function") {
            localEventFired = true;
            if (name === "rejectionHandled") {
                localHandler(promise);
            } else {
                localHandler(reason, promise);
            }
        }
    } catch (e) {
        async.throwLater(e);
    }

    if (name === "unhandledRejection") {
        if (!activeFireEvent(name, reason, promise) && !localEventFired) {
            formatAndLogError(reason, "Unhandled rejection ");
        }
    } else {
        activeFireEvent(name, promise);
    }
}

function formatNonError(obj) {
    var str;
    if (typeof obj === "function") {
        str = "[function " +
            (obj.name || "anonymous") +
            "]";
    } else {
        str = obj && typeof obj.toString === "function"
            ? obj.toString() : util.toString(obj);
        var ruselessToString = /\[object [a-zA-Z0-9$_]+\]/;
        if (ruselessToString.test(str)) {
            try {
                var newStr = JSON.stringify(obj);
                str = newStr;
            }
            catch(e) {

            }
        }
        if (str.length === 0) {
            str = "(empty array)";
        }
    }
    return ("(<" + snip(str) + ">, no stack trace)");
}

function snip(str) {
    var maxChars = 41;
    if (str.length < maxChars) {
        return str;
    }
    return str.substr(0, maxChars - 3) + "...";
}

function longStackTracesIsSupported() {
    return typeof captureStackTrace === "function";
}

var shouldIgnore = function() { return false; };
var parseLineInfoRegex = /[\/<\(]([^:\/]+):(\d+):(?:\d+)\)?\s*$/;
function parseLineInfo(line) {
    var matches = line.match(parseLineInfoRegex);
    if (matches) {
        return {
            fileName: matches[1],
            line: parseInt(matches[2], 10)
        };
    }
}

function setBounds(firstLineError, lastLineError) {
    if (!longStackTracesIsSupported()) return;
    var firstStackLines = firstLineError.stack.split("\n");
    var lastStackLines = lastLineError.stack.split("\n");
    var firstIndex = -1;
    var lastIndex = -1;
    var firstFileName;
    var lastFileName;
    for (var i = 0; i < firstStackLines.length; ++i) {
        var result = parseLineInfo(firstStackLines[i]);
        if (result) {
            firstFileName = result.fileName;
            firstIndex = result.line;
            break;
        }
    }
    for (var i = 0; i < lastStackLines.length; ++i) {
        var result = parseLineInfo(lastStackLines[i]);
        if (result) {
            lastFileName = result.fileName;
            lastIndex = result.line;
            break;
        }
    }
    if (firstIndex < 0 || lastIndex < 0 || !firstFileName || !lastFileName ||
        firstFileName !== lastFileName || firstIndex >= lastIndex) {
        return;
    }

    shouldIgnore = function(line) {
        if (bluebirdFramePattern.test(line)) return true;
        var info = parseLineInfo(line);
        if (info) {
            if (info.fileName === firstFileName &&
                (firstIndex <= info.line && info.line <= lastIndex)) {
                return true;
            }
        }
        return false;
    };
}

function CapturedTrace(parent) {
    this._parent = parent;
    this._promisesCreated = 0;
    var length = this._length = 1 + (parent === undefined ? 0 : parent._length);
    captureStackTrace(this, CapturedTrace);
    if (length > 32) this.uncycle();
}
util.inherits(CapturedTrace, Error);
Context.CapturedTrace = CapturedTrace;

CapturedTrace.prototype.uncycle = function() {
    var length = this._length;
    if (length < 2) return;
    var nodes = [];
    var stackToIndex = {};

    for (var i = 0, node = this; node !== undefined; ++i) {
        nodes.push(node);
        node = node._parent;
    }
    length = this._length = i;
    for (var i = length - 1; i >= 0; --i) {
        var stack = nodes[i].stack;
        if (stackToIndex[stack] === undefined) {
            stackToIndex[stack] = i;
        }
    }
    for (var i = 0; i < length; ++i) {
        var currentStack = nodes[i].stack;
        var index = stackToIndex[currentStack];
        if (index !== undefined && index !== i) {
            if (index > 0) {
                nodes[index - 1]._parent = undefined;
                nodes[index - 1]._length = 1;
            }
            nodes[i]._parent = undefined;
            nodes[i]._length = 1;
            var cycleEdgeNode = i > 0 ? nodes[i - 1] : this;

            if (index < length - 1) {
                cycleEdgeNode._parent = nodes[index + 1];
                cycleEdgeNode._parent.uncycle();
                cycleEdgeNode._length =
                    cycleEdgeNode._parent._length + 1;
            } else {
                cycleEdgeNode._parent = undefined;
                cycleEdgeNode._length = 1;
            }
            var currentChildLength = cycleEdgeNode._length + 1;
            for (var j = i - 2; j >= 0; --j) {
                nodes[j]._length = currentChildLength;
                currentChildLength++;
            }
            return;
        }
    }
};

CapturedTrace.prototype.attachExtraTrace = function(error) {
    if (error.__stackCleaned__) return;
    this.uncycle();
    var parsed = parseStackAndMessage(error);
    var message = parsed.message;
    var stacks = [parsed.stack];

    var trace = this;
    while (trace !== undefined) {
        stacks.push(cleanStack(trace.stack.split("\n")));
        trace = trace._parent;
    }
    removeCommonRoots(stacks);
    removeDuplicateOrEmptyJumps(stacks);
    util.notEnumerableProp(error, "stack", reconstructStack(message, stacks));
    util.notEnumerableProp(error, "__stackCleaned__", true);
};

var captureStackTrace = (function stackDetection() {
    var v8stackFramePattern = /^\s*at\s*/;
    var v8stackFormatter = function(stack, error) {
        if (typeof stack === "string") return stack;

        if (error.name !== undefined &&
            error.message !== undefined) {
            return error.toString();
        }
        return formatNonError(error);
    };

    if (typeof Error.stackTraceLimit === "number" &&
        typeof Error.captureStackTrace === "function") {
        Error.stackTraceLimit += 6;
        stackFramePattern = v8stackFramePattern;
        formatStack = v8stackFormatter;
        var captureStackTrace = Error.captureStackTrace;

        shouldIgnore = function(line) {
            return bluebirdFramePattern.test(line);
        };
        return function(receiver, ignoreUntil) {
            Error.stackTraceLimit += 6;
            captureStackTrace(receiver, ignoreUntil);
            Error.stackTraceLimit -= 6;
        };
    }
    var err = new Error();

    if (typeof err.stack === "string" &&
        err.stack.split("\n")[0].indexOf("stackDetection@") >= 0) {
        stackFramePattern = /@/;
        formatStack = v8stackFormatter;
        indentStackFrames = true;
        return function captureStackTrace(o) {
            o.stack = new Error().stack;
        };
    }

    var hasStackAfterThrow;
    try { throw new Error(); }
    catch(e) {
        hasStackAfterThrow = ("stack" in e);
    }
    if (!("stack" in err) && hasStackAfterThrow &&
        typeof Error.stackTraceLimit === "number") {
        stackFramePattern = v8stackFramePattern;
        formatStack = v8stackFormatter;
        return function captureStackTrace(o) {
            Error.stackTraceLimit += 6;
            try { throw new Error(); }
            catch(e) { o.stack = e.stack; }
            Error.stackTraceLimit -= 6;
        };
    }

    formatStack = function(stack, error) {
        if (typeof stack === "string") return stack;

        if ((typeof error === "object" ||
            typeof error === "function") &&
            error.name !== undefined &&
            error.message !== undefined) {
            return error.toString();
        }
        return formatNonError(error);
    };

    return null;

})([]);

if (typeof console !== "undefined" && typeof console.warn !== "undefined") {
    printWarning = function (message) {
        console.warn(message);
    };
    if (util.isNode && process.stderr.isTTY) {
        printWarning = function(message, isSoft) {
            var color = isSoft ? "\u001b[33m" : "\u001b[31m";
            console.warn(color + message + "\u001b[0m\n");
        };
    } else if (!util.isNode && typeof (new Error().stack) === "string") {
        printWarning = function(message, isSoft) {
            console.warn("%c" + message,
                        isSoft ? "color: darkorange" : "color: red");
        };
    }
}

var config = {
    warnings: warnings,
    longStackTraces: false,
    cancellation: false,
    monitoring: false
};

if (longStackTraces) Promise.longStackTraces();

return {
    longStackTraces: function() {
        return config.longStackTraces;
    },
    warnings: function() {
        return config.warnings;
    },
    cancellation: function() {
        return config.cancellation;
    },
    monitoring: function() {
        return config.monitoring;
    },
    propagateFromFunction: function() {
        return propagateFromFunction;
    },
    boundValueFunction: function() {
        return boundValueFunction;
    },
    checkForgottenReturns: checkForgottenReturns,
    setBounds: setBounds,
    warn: warn,
    deprecated: deprecated,
    CapturedTrace: CapturedTrace,
    fireDomEvent: fireDomEvent,
    fireGlobalEvent: fireGlobalEvent
};
};

},{"./errors":12,"./es5":13,"./util":36}],10:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise) {
function returner() {
    return this.value;
}
function thrower() {
    throw this.reason;
}

Promise.prototype["return"] =
Promise.prototype.thenReturn = function (value) {
    if (value instanceof Promise) value.suppressUnhandledRejections();
    return this._then(
        returner, undefined, undefined, {value: value}, undefined);
};

Promise.prototype["throw"] =
Promise.prototype.thenThrow = function (reason) {
    return this._then(
        thrower, undefined, undefined, {reason: reason}, undefined);
};

Promise.prototype.catchThrow = function (reason) {
    if (arguments.length <= 1) {
        return this._then(
            undefined, thrower, undefined, {reason: reason}, undefined);
    } else {
        var _reason = arguments[1];
        var handler = function() {throw _reason;};
        return this.caught(reason, handler);
    }
};

Promise.prototype.catchReturn = function (value) {
    if (arguments.length <= 1) {
        if (value instanceof Promise) value.suppressUnhandledRejections();
        return this._then(
            undefined, returner, undefined, {value: value}, undefined);
    } else {
        var _value = arguments[1];
        if (_value instanceof Promise) _value.suppressUnhandledRejections();
        var handler = function() {return _value;};
        return this.caught(value, handler);
    }
};
};

},{}],11:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise, INTERNAL) {
var PromiseReduce = Promise.reduce;
var PromiseAll = Promise.all;

function promiseAllThis() {
    return PromiseAll(this);
}

function PromiseMapSeries(promises, fn) {
    return PromiseReduce(promises, fn, INTERNAL, INTERNAL);
}

Promise.prototype.each = function (fn) {
    return PromiseReduce(this, fn, INTERNAL, 0)
              ._then(promiseAllThis, undefined, undefined, this, undefined);
};

Promise.prototype.mapSeries = function (fn) {
    return PromiseReduce(this, fn, INTERNAL, INTERNAL);
};

Promise.each = function (promises, fn) {
    return PromiseReduce(promises, fn, INTERNAL, 0)
              ._then(promiseAllThis, undefined, undefined, promises, undefined);
};

Promise.mapSeries = PromiseMapSeries;
};


},{}],12:[function(_dereq_,module,exports){
"use strict";
var es5 = _dereq_("./es5");
var Objectfreeze = es5.freeze;
var util = _dereq_("./util");
var inherits = util.inherits;
var notEnumerableProp = util.notEnumerableProp;

function subError(nameProperty, defaultMessage) {
    function SubError(message) {
        if (!(this instanceof SubError)) return new SubError(message);
        notEnumerableProp(this, "message",
            typeof message === "string" ? message : defaultMessage);
        notEnumerableProp(this, "name", nameProperty);
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        } else {
            Error.call(this);
        }
    }
    inherits(SubError, Error);
    return SubError;
}

var _TypeError, _RangeError;
var Warning = subError("Warning", "warning");
var CancellationError = subError("CancellationError", "cancellation error");
var TimeoutError = subError("TimeoutError", "timeout error");
var AggregateError = subError("AggregateError", "aggregate error");
try {
    _TypeError = TypeError;
    _RangeError = RangeError;
} catch(e) {
    _TypeError = subError("TypeError", "type error");
    _RangeError = subError("RangeError", "range error");
}

var methods = ("join pop push shift unshift slice filter forEach some " +
    "every map indexOf lastIndexOf reduce reduceRight sort reverse").split(" ");

for (var i = 0; i < methods.length; ++i) {
    if (typeof Array.prototype[methods[i]] === "function") {
        AggregateError.prototype[methods[i]] = Array.prototype[methods[i]];
    }
}

es5.defineProperty(AggregateError.prototype, "length", {
    value: 0,
    configurable: false,
    writable: true,
    enumerable: true
});
AggregateError.prototype["isOperational"] = true;
var level = 0;
AggregateError.prototype.toString = function() {
    var indent = Array(level * 4 + 1).join(" ");
    var ret = "\n" + indent + "AggregateError of:" + "\n";
    level++;
    indent = Array(level * 4 + 1).join(" ");
    for (var i = 0; i < this.length; ++i) {
        var str = this[i] === this ? "[Circular AggregateError]" : this[i] + "";
        var lines = str.split("\n");
        for (var j = 0; j < lines.length; ++j) {
            lines[j] = indent + lines[j];
        }
        str = lines.join("\n");
        ret += str + "\n";
    }
    level--;
    return ret;
};

function OperationalError(message) {
    if (!(this instanceof OperationalError))
        return new OperationalError(message);
    notEnumerableProp(this, "name", "OperationalError");
    notEnumerableProp(this, "message", message);
    this.cause = message;
    this["isOperational"] = true;

    if (message instanceof Error) {
        notEnumerableProp(this, "message", message.message);
        notEnumerableProp(this, "stack", message.stack);
    } else if (Error.captureStackTrace) {
        Error.captureStackTrace(this, this.constructor);
    }

}
inherits(OperationalError, Error);

var errorTypes = Error["__BluebirdErrorTypes__"];
if (!errorTypes) {
    errorTypes = Objectfreeze({
        CancellationError: CancellationError,
        TimeoutError: TimeoutError,
        OperationalError: OperationalError,
        RejectionError: OperationalError,
        AggregateError: AggregateError
    });
    es5.defineProperty(Error, "__BluebirdErrorTypes__", {
        value: errorTypes,
        writable: false,
        enumerable: false,
        configurable: false
    });
}

module.exports = {
    Error: Error,
    TypeError: _TypeError,
    RangeError: _RangeError,
    CancellationError: errorTypes.CancellationError,
    OperationalError: errorTypes.OperationalError,
    TimeoutError: errorTypes.TimeoutError,
    AggregateError: errorTypes.AggregateError,
    Warning: Warning
};

},{"./es5":13,"./util":36}],13:[function(_dereq_,module,exports){
var isES5 = (function(){
    "use strict";
    return this === undefined;
})();

if (isES5) {
    module.exports = {
        freeze: Object.freeze,
        defineProperty: Object.defineProperty,
        getDescriptor: Object.getOwnPropertyDescriptor,
        keys: Object.keys,
        names: Object.getOwnPropertyNames,
        getPrototypeOf: Object.getPrototypeOf,
        isArray: Array.isArray,
        isES5: isES5,
        propertyIsWritable: function(obj, prop) {
            var descriptor = Object.getOwnPropertyDescriptor(obj, prop);
            return !!(!descriptor || descriptor.writable || descriptor.set);
        }
    };
} else {
    var has = {}.hasOwnProperty;
    var str = {}.toString;
    var proto = {}.constructor.prototype;

    var ObjectKeys = function (o) {
        var ret = [];
        for (var key in o) {
            if (has.call(o, key)) {
                ret.push(key);
            }
        }
        return ret;
    };

    var ObjectGetDescriptor = function(o, key) {
        return {value: o[key]};
    };

    var ObjectDefineProperty = function (o, key, desc) {
        o[key] = desc.value;
        return o;
    };

    var ObjectFreeze = function (obj) {
        return obj;
    };

    var ObjectGetPrototypeOf = function (obj) {
        try {
            return Object(obj).constructor.prototype;
        }
        catch (e) {
            return proto;
        }
    };

    var ArrayIsArray = function (obj) {
        try {
            return str.call(obj) === "[object Array]";
        }
        catch(e) {
            return false;
        }
    };

    module.exports = {
        isArray: ArrayIsArray,
        keys: ObjectKeys,
        names: ObjectKeys,
        defineProperty: ObjectDefineProperty,
        getDescriptor: ObjectGetDescriptor,
        freeze: ObjectFreeze,
        getPrototypeOf: ObjectGetPrototypeOf,
        isES5: isES5,
        propertyIsWritable: function() {
            return true;
        }
    };
}

},{}],14:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise, INTERNAL) {
var PromiseMap = Promise.map;

Promise.prototype.filter = function (fn, options) {
    return PromiseMap(this, fn, options, INTERNAL);
};

Promise.filter = function (promises, fn, options) {
    return PromiseMap(promises, fn, options, INTERNAL);
};
};

},{}],15:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise, tryConvertToPromise, NEXT_FILTER) {
var util = _dereq_("./util");
var CancellationError = Promise.CancellationError;
var errorObj = util.errorObj;
var catchFilter = _dereq_("./catch_filter")(NEXT_FILTER);

function PassThroughHandlerContext(promise, type, handler) {
    this.promise = promise;
    this.type = type;
    this.handler = handler;
    this.called = false;
    this.cancelPromise = null;
}

PassThroughHandlerContext.prototype.isFinallyHandler = function() {
    return this.type === 0;
};

function FinallyHandlerCancelReaction(finallyHandler) {
    this.finallyHandler = finallyHandler;
}

FinallyHandlerCancelReaction.prototype._resultCancelled = function() {
    checkCancel(this.finallyHandler);
};

function checkCancel(ctx, reason) {
    if (ctx.cancelPromise != null) {
        if (arguments.length > 1) {
            ctx.cancelPromise._reject(reason);
        } else {
            ctx.cancelPromise._cancel();
        }
        ctx.cancelPromise = null;
        return true;
    }
    return false;
}

function succeed() {
    return finallyHandler.call(this, this.promise._target()._settledValue());
}
function fail(reason) {
    if (checkCancel(this, reason)) return;
    errorObj.e = reason;
    return errorObj;
}
function finallyHandler(reasonOrValue) {
    var promise = this.promise;
    var handler = this.handler;

    if (!this.called) {
        this.called = true;
        var ret = this.isFinallyHandler()
            ? handler.call(promise._boundValue())
            : handler.call(promise._boundValue(), reasonOrValue);
        if (ret === NEXT_FILTER) {
            return ret;
        } else if (ret !== undefined) {
            promise._setReturnedNonUndefined();
            var maybePromise = tryConvertToPromise(ret, promise);
            if (maybePromise instanceof Promise) {
                if (this.cancelPromise != null) {
                    if (maybePromise._isCancelled()) {
                        var reason =
                            new CancellationError("late cancellation observer");
                        promise._attachExtraTrace(reason);
                        errorObj.e = reason;
                        return errorObj;
                    } else if (maybePromise.isPending()) {
                        maybePromise._attachCancellationCallback(
                            new FinallyHandlerCancelReaction(this));
                    }
                }
                return maybePromise._then(
                    succeed, fail, undefined, this, undefined);
            }
        }
    }

    if (promise.isRejected()) {
        checkCancel(this);
        errorObj.e = reasonOrValue;
        return errorObj;
    } else {
        checkCancel(this);
        return reasonOrValue;
    }
}

Promise.prototype._passThrough = function(handler, type, success, fail) {
    if (typeof handler !== "function") return this.then();
    return this._then(success,
                      fail,
                      undefined,
                      new PassThroughHandlerContext(this, type, handler),
                      undefined);
};

Promise.prototype.lastly =
Promise.prototype["finally"] = function (handler) {
    return this._passThrough(handler,
                             0,
                             finallyHandler,
                             finallyHandler);
};


Promise.prototype.tap = function (handler) {
    return this._passThrough(handler, 1, finallyHandler);
};

Promise.prototype.tapCatch = function (handlerOrPredicate) {
    var len = arguments.length;
    if(len === 1) {
        return this._passThrough(handlerOrPredicate,
                                 1,
                                 undefined,
                                 finallyHandler);
    } else {
         var catchInstances = new Array(len - 1),
            j = 0, i;
        for (i = 0; i < len - 1; ++i) {
            var item = arguments[i];
            if (util.isObject(item)) {
                catchInstances[j++] = item;
            } else {
                return Promise.reject(new TypeError(
                    "tapCatch statement predicate: "
                    + "expecting an object but got " + util.classString(item)
                ));
            }
        }
        catchInstances.length = j;
        var handler = arguments[i];
        return this._passThrough(catchFilter(catchInstances, handler, this),
                                 1,
                                 undefined,
                                 finallyHandler);
    }

};

return PassThroughHandlerContext;
};

},{"./catch_filter":7,"./util":36}],16:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise,
                          apiRejection,
                          INTERNAL,
                          tryConvertToPromise,
                          Proxyable,
                          debug) {
var errors = _dereq_("./errors");
var TypeError = errors.TypeError;
var util = _dereq_("./util");
var errorObj = util.errorObj;
var tryCatch = util.tryCatch;
var yieldHandlers = [];

function promiseFromYieldHandler(value, yieldHandlers, traceParent) {
    for (var i = 0; i < yieldHandlers.length; ++i) {
        traceParent._pushContext();
        var result = tryCatch(yieldHandlers[i])(value);
        traceParent._popContext();
        if (result === errorObj) {
            traceParent._pushContext();
            var ret = Promise.reject(errorObj.e);
            traceParent._popContext();
            return ret;
        }
        var maybePromise = tryConvertToPromise(result, traceParent);
        if (maybePromise instanceof Promise) return maybePromise;
    }
    return null;
}

function PromiseSpawn(generatorFunction, receiver, yieldHandler, stack) {
    if (debug.cancellation()) {
        var internal = new Promise(INTERNAL);
        var _finallyPromise = this._finallyPromise = new Promise(INTERNAL);
        this._promise = internal.lastly(function() {
            return _finallyPromise;
        });
        internal._captureStackTrace();
        internal._setOnCancel(this);
    } else {
        var promise = this._promise = new Promise(INTERNAL);
        promise._captureStackTrace();
    }
    this._stack = stack;
    this._generatorFunction = generatorFunction;
    this._receiver = receiver;
    this._generator = undefined;
    this._yieldHandlers = typeof yieldHandler === "function"
        ? [yieldHandler].concat(yieldHandlers)
        : yieldHandlers;
    this._yieldedPromise = null;
    this._cancellationPhase = false;
}
util.inherits(PromiseSpawn, Proxyable);

PromiseSpawn.prototype._isResolved = function() {
    return this._promise === null;
};

PromiseSpawn.prototype._cleanup = function() {
    this._promise = this._generator = null;
    if (debug.cancellation() && this._finallyPromise !== null) {
        this._finallyPromise._fulfill();
        this._finallyPromise = null;
    }
};

PromiseSpawn.prototype._promiseCancelled = function() {
    if (this._isResolved()) return;
    var implementsReturn = typeof this._generator["return"] !== "undefined";

    var result;
    if (!implementsReturn) {
        var reason = new Promise.CancellationError(
            "generator .return() sentinel");
        Promise.coroutine.returnSentinel = reason;
        this._promise._attachExtraTrace(reason);
        this._promise._pushContext();
        result = tryCatch(this._generator["throw"]).call(this._generator,
                                                         reason);
        this._promise._popContext();
    } else {
        this._promise._pushContext();
        result = tryCatch(this._generator["return"]).call(this._generator,
                                                          undefined);
        this._promise._popContext();
    }
    this._cancellationPhase = true;
    this._yieldedPromise = null;
    this._continue(result);
};

PromiseSpawn.prototype._promiseFulfilled = function(value) {
    this._yieldedPromise = null;
    this._promise._pushContext();
    var result = tryCatch(this._generator.next).call(this._generator, value);
    this._promise._popContext();
    this._continue(result);
};

PromiseSpawn.prototype._promiseRejected = function(reason) {
    this._yieldedPromise = null;
    this._promise._attachExtraTrace(reason);
    this._promise._pushContext();
    var result = tryCatch(this._generator["throw"])
        .call(this._generator, reason);
    this._promise._popContext();
    this._continue(result);
};

PromiseSpawn.prototype._resultCancelled = function() {
    if (this._yieldedPromise instanceof Promise) {
        var promise = this._yieldedPromise;
        this._yieldedPromise = null;
        promise.cancel();
    }
};

PromiseSpawn.prototype.promise = function () {
    return this._promise;
};

PromiseSpawn.prototype._run = function () {
    this._generator = this._generatorFunction.call(this._receiver);
    this._receiver =
        this._generatorFunction = undefined;
    this._promiseFulfilled(undefined);
};

PromiseSpawn.prototype._continue = function (result) {
    var promise = this._promise;
    if (result === errorObj) {
        this._cleanup();
        if (this._cancellationPhase) {
            return promise.cancel();
        } else {
            return promise._rejectCallback(result.e, false);
        }
    }

    var value = result.value;
    if (result.done === true) {
        this._cleanup();
        if (this._cancellationPhase) {
            return promise.cancel();
        } else {
            return promise._resolveCallback(value);
        }
    } else {
        var maybePromise = tryConvertToPromise(value, this._promise);
        if (!(maybePromise instanceof Promise)) {
            maybePromise =
                promiseFromYieldHandler(maybePromise,
                                        this._yieldHandlers,
                                        this._promise);
            if (maybePromise === null) {
                this._promiseRejected(
                    new TypeError(
                        "A value %s was yielded that could not be treated as a promise\u000a\u000a    See http://goo.gl/MqrFmX\u000a\u000a".replace("%s", String(value)) +
                        "From coroutine:\u000a" +
                        this._stack.split("\n").slice(1, -7).join("\n")
                    )
                );
                return;
            }
        }
        maybePromise = maybePromise._target();
        var bitField = maybePromise._bitField;
        ;
        if (((bitField & 50397184) === 0)) {
            this._yieldedPromise = maybePromise;
            maybePromise._proxy(this, null);
        } else if (((bitField & 33554432) !== 0)) {
            Promise._async.invoke(
                this._promiseFulfilled, this, maybePromise._value()
            );
        } else if (((bitField & 16777216) !== 0)) {
            Promise._async.invoke(
                this._promiseRejected, this, maybePromise._reason()
            );
        } else {
            this._promiseCancelled();
        }
    }
};

Promise.coroutine = function (generatorFunction, options) {
    if (typeof generatorFunction !== "function") {
        throw new TypeError("generatorFunction must be a function\u000a\u000a    See http://goo.gl/MqrFmX\u000a");
    }
    var yieldHandler = Object(options).yieldHandler;
    var PromiseSpawn$ = PromiseSpawn;
    var stack = new Error().stack;
    return function () {
        var generator = generatorFunction.apply(this, arguments);
        var spawn = new PromiseSpawn$(undefined, undefined, yieldHandler,
                                      stack);
        var ret = spawn.promise();
        spawn._generator = generator;
        spawn._promiseFulfilled(undefined);
        return ret;
    };
};

Promise.coroutine.addYieldHandler = function(fn) {
    if (typeof fn !== "function") {
        throw new TypeError("expecting a function but got " + util.classString(fn));
    }
    yieldHandlers.push(fn);
};

Promise.spawn = function (generatorFunction) {
    debug.deprecated("Promise.spawn()", "Promise.coroutine()");
    if (typeof generatorFunction !== "function") {
        return apiRejection("generatorFunction must be a function\u000a\u000a    See http://goo.gl/MqrFmX\u000a");
    }
    var spawn = new PromiseSpawn(generatorFunction, this);
    var ret = spawn.promise();
    spawn._run(Promise.spawn);
    return ret;
};
};

},{"./errors":12,"./util":36}],17:[function(_dereq_,module,exports){
"use strict";
module.exports =
function(Promise, PromiseArray, tryConvertToPromise, INTERNAL, async,
         getDomain) {
var util = _dereq_("./util");
var canEvaluate = util.canEvaluate;
var tryCatch = util.tryCatch;
var errorObj = util.errorObj;
var reject;

if (!true) {
if (canEvaluate) {
    var thenCallback = function(i) {
        return new Function("value", "holder", "                             \n\
            'use strict';                                                    \n\
            holder.pIndex = value;                                           \n\
            holder.checkFulfillment(this);                                   \n\
            ".replace(/Index/g, i));
    };

    var promiseSetter = function(i) {
        return new Function("promise", "holder", "                           \n\
            'use strict';                                                    \n\
            holder.pIndex = promise;                                         \n\
            ".replace(/Index/g, i));
    };

    var generateHolderClass = function(total) {
        var props = new Array(total);
        for (var i = 0; i < props.length; ++i) {
            props[i] = "this.p" + (i+1);
        }
        var assignment = props.join(" = ") + " = null;";
        var cancellationCode= "var promise;\n" + props.map(function(prop) {
            return "                                                         \n\
                promise = " + prop + ";                                      \n\
                if (promise instanceof Promise) {                            \n\
                    promise.cancel();                                        \n\
                }                                                            \n\
            ";
        }).join("\n");
        var passedArguments = props.join(", ");
        var name = "Holder$" + total;


        var code = "return function(tryCatch, errorObj, Promise, async) {    \n\
            'use strict';                                                    \n\
            function [TheName](fn) {                                         \n\
                [TheProperties]                                              \n\
                this.fn = fn;                                                \n\
                this.asyncNeeded = true;                                     \n\
                this.now = 0;                                                \n\
            }                                                                \n\
                                                                             \n\
            [TheName].prototype._callFunction = function(promise) {          \n\
                promise._pushContext();                                      \n\
                var ret = tryCatch(this.fn)([ThePassedArguments]);           \n\
                promise._popContext();                                       \n\
                if (ret === errorObj) {                                      \n\
                    promise._rejectCallback(ret.e, false);                   \n\
                } else {                                                     \n\
                    promise._resolveCallback(ret);                           \n\
                }                                                            \n\
            };                                                               \n\
                                                                             \n\
            [TheName].prototype.checkFulfillment = function(promise) {       \n\
                var now = ++this.now;                                        \n\
                if (now === [TheTotal]) {                                    \n\
                    if (this.asyncNeeded) {                                  \n\
                        async.invoke(this._callFunction, this, promise);     \n\
                    } else {                                                 \n\
                        this._callFunction(promise);                         \n\
                    }                                                        \n\
                                                                             \n\
                }                                                            \n\
            };                                                               \n\
                                                                             \n\
            [TheName].prototype._resultCancelled = function() {              \n\
                [CancellationCode]                                           \n\
            };                                                               \n\
                                                                             \n\
            return [TheName];                                                \n\
        }(tryCatch, errorObj, Promise, async);                               \n\
        ";

        code = code.replace(/\[TheName\]/g, name)
            .replace(/\[TheTotal\]/g, total)
            .replace(/\[ThePassedArguments\]/g, passedArguments)
            .replace(/\[TheProperties\]/g, assignment)
            .replace(/\[CancellationCode\]/g, cancellationCode);

        return new Function("tryCatch", "errorObj", "Promise", "async", code)
                           (tryCatch, errorObj, Promise, async);
    };

    var holderClasses = [];
    var thenCallbacks = [];
    var promiseSetters = [];

    for (var i = 0; i < 8; ++i) {
        holderClasses.push(generateHolderClass(i + 1));
        thenCallbacks.push(thenCallback(i + 1));
        promiseSetters.push(promiseSetter(i + 1));
    }

    reject = function (reason) {
        this._reject(reason);
    };
}}

Promise.join = function () {
    var last = arguments.length - 1;
    var fn;
    if (last > 0 && typeof arguments[last] === "function") {
        fn = arguments[last];
        if (!true) {
            if (last <= 8 && canEvaluate) {
                var ret = new Promise(INTERNAL);
                ret._captureStackTrace();
                var HolderClass = holderClasses[last - 1];
                var holder = new HolderClass(fn);
                var callbacks = thenCallbacks;

                for (var i = 0; i < last; ++i) {
                    var maybePromise = tryConvertToPromise(arguments[i], ret);
                    if (maybePromise instanceof Promise) {
                        maybePromise = maybePromise._target();
                        var bitField = maybePromise._bitField;
                        ;
                        if (((bitField & 50397184) === 0)) {
                            maybePromise._then(callbacks[i], reject,
                                               undefined, ret, holder);
                            promiseSetters[i](maybePromise, holder);
                            holder.asyncNeeded = false;
                        } else if (((bitField & 33554432) !== 0)) {
                            callbacks[i].call(ret,
                                              maybePromise._value(), holder);
                        } else if (((bitField & 16777216) !== 0)) {
                            ret._reject(maybePromise._reason());
                        } else {
                            ret._cancel();
                        }
                    } else {
                        callbacks[i].call(ret, maybePromise, holder);
                    }
                }

                if (!ret._isFateSealed()) {
                    if (holder.asyncNeeded) {
                        var domain = getDomain();
                        if (domain !== null) {
                            holder.fn = util.domainBind(domain, holder.fn);
                        }
                    }
                    ret._setAsyncGuaranteed();
                    ret._setOnCancel(holder);
                }
                return ret;
            }
        }
    }
    var args = [].slice.call(arguments);;
    if (fn) args.pop();
    var ret = new PromiseArray(args).promise();
    return fn !== undefined ? ret.spread(fn) : ret;
};

};

},{"./util":36}],18:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise,
                          PromiseArray,
                          apiRejection,
                          tryConvertToPromise,
                          INTERNAL,
                          debug) {
var getDomain = Promise._getDomain;
var util = _dereq_("./util");
var tryCatch = util.tryCatch;
var errorObj = util.errorObj;
var async = Promise._async;

function MappingPromiseArray(promises, fn, limit, _filter) {
    this.constructor$(promises);
    this._promise._captureStackTrace();
    var domain = getDomain();
    this._callback = domain === null ? fn : util.domainBind(domain, fn);
    this._preservedValues = _filter === INTERNAL
        ? new Array(this.length())
        : null;
    this._limit = limit;
    this._inFlight = 0;
    this._queue = [];
    async.invoke(this._asyncInit, this, undefined);
}
util.inherits(MappingPromiseArray, PromiseArray);

MappingPromiseArray.prototype._asyncInit = function() {
    this._init$(undefined, -2);
};

MappingPromiseArray.prototype._init = function () {};

MappingPromiseArray.prototype._promiseFulfilled = function (value, index) {
    var values = this._values;
    var length = this.length();
    var preservedValues = this._preservedValues;
    var limit = this._limit;

    if (index < 0) {
        index = (index * -1) - 1;
        values[index] = value;
        if (limit >= 1) {
            this._inFlight--;
            this._drainQueue();
            if (this._isResolved()) return true;
        }
    } else {
        if (limit >= 1 && this._inFlight >= limit) {
            values[index] = value;
            this._queue.push(index);
            return false;
        }
        if (preservedValues !== null) preservedValues[index] = value;

        var promise = this._promise;
        var callback = this._callback;
        var receiver = promise._boundValue();
        promise._pushContext();
        var ret = tryCatch(callback).call(receiver, value, index, length);
        var promiseCreated = promise._popContext();
        debug.checkForgottenReturns(
            ret,
            promiseCreated,
            preservedValues !== null ? "Promise.filter" : "Promise.map",
            promise
        );
        if (ret === errorObj) {
            this._reject(ret.e);
            return true;
        }

        var maybePromise = tryConvertToPromise(ret, this._promise);
        if (maybePromise instanceof Promise) {
            maybePromise = maybePromise._target();
            var bitField = maybePromise._bitField;
            ;
            if (((bitField & 50397184) === 0)) {
                if (limit >= 1) this._inFlight++;
                values[index] = maybePromise;
                maybePromise._proxy(this, (index + 1) * -1);
                return false;
            } else if (((bitField & 33554432) !== 0)) {
                ret = maybePromise._value();
            } else if (((bitField & 16777216) !== 0)) {
                this._reject(maybePromise._reason());
                return true;
            } else {
                this._cancel();
                return true;
            }
        }
        values[index] = ret;
    }
    var totalResolved = ++this._totalResolved;
    if (totalResolved >= length) {
        if (preservedValues !== null) {
            this._filter(values, preservedValues);
        } else {
            this._resolve(values);
        }
        return true;
    }
    return false;
};

MappingPromiseArray.prototype._drainQueue = function () {
    var queue = this._queue;
    var limit = this._limit;
    var values = this._values;
    while (queue.length > 0 && this._inFlight < limit) {
        if (this._isResolved()) return;
        var index = queue.pop();
        this._promiseFulfilled(values[index], index);
    }
};

MappingPromiseArray.prototype._filter = function (booleans, values) {
    var len = values.length;
    var ret = new Array(len);
    var j = 0;
    for (var i = 0; i < len; ++i) {
        if (booleans[i]) ret[j++] = values[i];
    }
    ret.length = j;
    this._resolve(ret);
};

MappingPromiseArray.prototype.preservedValues = function () {
    return this._preservedValues;
};

function map(promises, fn, options, _filter) {
    if (typeof fn !== "function") {
        return apiRejection("expecting a function but got " + util.classString(fn));
    }

    var limit = 0;
    if (options !== undefined) {
        if (typeof options === "object" && options !== null) {
            if (typeof options.concurrency !== "number") {
                return Promise.reject(
                    new TypeError("'concurrency' must be a number but it is " +
                                    util.classString(options.concurrency)));
            }
            limit = options.concurrency;
        } else {
            return Promise.reject(new TypeError(
                            "options argument must be an object but it is " +
                             util.classString(options)));
        }
    }
    limit = typeof limit === "number" &&
        isFinite(limit) && limit >= 1 ? limit : 0;
    return new MappingPromiseArray(promises, fn, limit, _filter).promise();
}

Promise.prototype.map = function (fn, options) {
    return map(this, fn, options, null);
};

Promise.map = function (promises, fn, options, _filter) {
    return map(promises, fn, options, _filter);
};


};

},{"./util":36}],19:[function(_dereq_,module,exports){
"use strict";
module.exports =
function(Promise, INTERNAL, tryConvertToPromise, apiRejection, debug) {
var util = _dereq_("./util");
var tryCatch = util.tryCatch;

Promise.method = function (fn) {
    if (typeof fn !== "function") {
        throw new Promise.TypeError("expecting a function but got " + util.classString(fn));
    }
    return function () {
        var ret = new Promise(INTERNAL);
        ret._captureStackTrace();
        ret._pushContext();
        var value = tryCatch(fn).apply(this, arguments);
        var promiseCreated = ret._popContext();
        debug.checkForgottenReturns(
            value, promiseCreated, "Promise.method", ret);
        ret._resolveFromSyncValue(value);
        return ret;
    };
};

Promise.attempt = Promise["try"] = function (fn) {
    if (typeof fn !== "function") {
        return apiRejection("expecting a function but got " + util.classString(fn));
    }
    var ret = new Promise(INTERNAL);
    ret._captureStackTrace();
    ret._pushContext();
    var value;
    if (arguments.length > 1) {
        debug.deprecated("calling Promise.try with more than 1 argument");
        var arg = arguments[1];
        var ctx = arguments[2];
        value = util.isArray(arg) ? tryCatch(fn).apply(ctx, arg)
                                  : tryCatch(fn).call(ctx, arg);
    } else {
        value = tryCatch(fn)();
    }
    var promiseCreated = ret._popContext();
    debug.checkForgottenReturns(
        value, promiseCreated, "Promise.try", ret);
    ret._resolveFromSyncValue(value);
    return ret;
};

Promise.prototype._resolveFromSyncValue = function (value) {
    if (value === util.errorObj) {
        this._rejectCallback(value.e, false);
    } else {
        this._resolveCallback(value, true);
    }
};
};

},{"./util":36}],20:[function(_dereq_,module,exports){
"use strict";
var util = _dereq_("./util");
var maybeWrapAsError = util.maybeWrapAsError;
var errors = _dereq_("./errors");
var OperationalError = errors.OperationalError;
var es5 = _dereq_("./es5");

function isUntypedError(obj) {
    return obj instanceof Error &&
        es5.getPrototypeOf(obj) === Error.prototype;
}

var rErrorKey = /^(?:name|message|stack|cause)$/;
function wrapAsOperationalError(obj) {
    var ret;
    if (isUntypedError(obj)) {
        ret = new OperationalError(obj);
        ret.name = obj.name;
        ret.message = obj.message;
        ret.stack = obj.stack;
        var keys = es5.keys(obj);
        for (var i = 0; i < keys.length; ++i) {
            var key = keys[i];
            if (!rErrorKey.test(key)) {
                ret[key] = obj[key];
            }
        }
        return ret;
    }
    util.markAsOriginatingFromRejection(obj);
    return obj;
}

function nodebackForPromise(promise, multiArgs) {
    return function(err, value) {
        if (promise === null) return;
        if (err) {
            var wrapped = wrapAsOperationalError(maybeWrapAsError(err));
            promise._attachExtraTrace(wrapped);
            promise._reject(wrapped);
        } else if (!multiArgs) {
            promise._fulfill(value);
        } else {
            var args = [].slice.call(arguments, 1);;
            promise._fulfill(args);
        }
        promise = null;
    };
}

module.exports = nodebackForPromise;

},{"./errors":12,"./es5":13,"./util":36}],21:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise) {
var util = _dereq_("./util");
var async = Promise._async;
var tryCatch = util.tryCatch;
var errorObj = util.errorObj;

function spreadAdapter(val, nodeback) {
    var promise = this;
    if (!util.isArray(val)) return successAdapter.call(promise, val, nodeback);
    var ret =
        tryCatch(nodeback).apply(promise._boundValue(), [null].concat(val));
    if (ret === errorObj) {
        async.throwLater(ret.e);
    }
}

function successAdapter(val, nodeback) {
    var promise = this;
    var receiver = promise._boundValue();
    var ret = val === undefined
        ? tryCatch(nodeback).call(receiver, null)
        : tryCatch(nodeback).call(receiver, null, val);
    if (ret === errorObj) {
        async.throwLater(ret.e);
    }
}
function errorAdapter(reason, nodeback) {
    var promise = this;
    if (!reason) {
        var newReason = new Error(reason + "");
        newReason.cause = reason;
        reason = newReason;
    }
    var ret = tryCatch(nodeback).call(promise._boundValue(), reason);
    if (ret === errorObj) {
        async.throwLater(ret.e);
    }
}

Promise.prototype.asCallback = Promise.prototype.nodeify = function (nodeback,
                                                                     options) {
    if (typeof nodeback == "function") {
        var adapter = successAdapter;
        if (options !== undefined && Object(options).spread) {
            adapter = spreadAdapter;
        }
        this._then(
            adapter,
            errorAdapter,
            undefined,
            this,
            nodeback
        );
    }
    return this;
};
};

},{"./util":36}],22:[function(_dereq_,module,exports){
"use strict";
module.exports = function() {
var makeSelfResolutionError = function () {
    return new TypeError("circular promise resolution chain\u000a\u000a    See http://goo.gl/MqrFmX\u000a");
};
var reflectHandler = function() {
    return new Promise.PromiseInspection(this._target());
};
var apiRejection = function(msg) {
    return Promise.reject(new TypeError(msg));
};
function Proxyable() {}
var UNDEFINED_BINDING = {};
var util = _dereq_("./util");

var getDomain;
if (util.isNode) {
    getDomain = function() {
        var ret = process.domain;
        if (ret === undefined) ret = null;
        return ret;
    };
} else {
    getDomain = function() {
        return null;
    };
}
util.notEnumerableProp(Promise, "_getDomain", getDomain);

var es5 = _dereq_("./es5");
var Async = _dereq_("./async");
var async = new Async();
es5.defineProperty(Promise, "_async", {value: async});
var errors = _dereq_("./errors");
var TypeError = Promise.TypeError = errors.TypeError;
Promise.RangeError = errors.RangeError;
var CancellationError = Promise.CancellationError = errors.CancellationError;
Promise.TimeoutError = errors.TimeoutError;
Promise.OperationalError = errors.OperationalError;
Promise.RejectionError = errors.OperationalError;
Promise.AggregateError = errors.AggregateError;
var INTERNAL = function(){};
var APPLY = {};
var NEXT_FILTER = {};
var tryConvertToPromise = _dereq_("./thenables")(Promise, INTERNAL);
var PromiseArray =
    _dereq_("./promise_array")(Promise, INTERNAL,
                               tryConvertToPromise, apiRejection, Proxyable);
var Context = _dereq_("./context")(Promise);
 /*jshint unused:false*/
var createContext = Context.create;
var debug = _dereq_("./debuggability")(Promise, Context);
var CapturedTrace = debug.CapturedTrace;
var PassThroughHandlerContext =
    _dereq_("./finally")(Promise, tryConvertToPromise, NEXT_FILTER);
var catchFilter = _dereq_("./catch_filter")(NEXT_FILTER);
var nodebackForPromise = _dereq_("./nodeback");
var errorObj = util.errorObj;
var tryCatch = util.tryCatch;
function check(self, executor) {
    if (self == null || self.constructor !== Promise) {
        throw new TypeError("the promise constructor cannot be invoked directly\u000a\u000a    See http://goo.gl/MqrFmX\u000a");
    }
    if (typeof executor !== "function") {
        throw new TypeError("expecting a function but got " + util.classString(executor));
    }

}

function Promise(executor) {
    if (executor !== INTERNAL) {
        check(this, executor);
    }
    this._bitField = 0;
    this._fulfillmentHandler0 = undefined;
    this._rejectionHandler0 = undefined;
    this._promise0 = undefined;
    this._receiver0 = undefined;
    this._resolveFromExecutor(executor);
    this._promiseCreated();
    this._fireEvent("promiseCreated", this);
}

Promise.prototype.toString = function () {
    return "[object Promise]";
};

Promise.prototype.caught = Promise.prototype["catch"] = function (fn) {
    var len = arguments.length;
    if (len > 1) {
        var catchInstances = new Array(len - 1),
            j = 0, i;
        for (i = 0; i < len - 1; ++i) {
            var item = arguments[i];
            if (util.isObject(item)) {
                catchInstances[j++] = item;
            } else {
                return apiRejection("Catch statement predicate: " +
                    "expecting an object but got " + util.classString(item));
            }
        }
        catchInstances.length = j;
        fn = arguments[i];
        return this.then(undefined, catchFilter(catchInstances, fn, this));
    }
    return this.then(undefined, fn);
};

Promise.prototype.reflect = function () {
    return this._then(reflectHandler,
        reflectHandler, undefined, this, undefined);
};

Promise.prototype.then = function (didFulfill, didReject) {
    if (debug.warnings() && arguments.length > 0 &&
        typeof didFulfill !== "function" &&
        typeof didReject !== "function") {
        var msg = ".then() only accepts functions but was passed: " +
                util.classString(didFulfill);
        if (arguments.length > 1) {
            msg += ", " + util.classString(didReject);
        }
        this._warn(msg);
    }
    return this._then(didFulfill, didReject, undefined, undefined, undefined);
};

Promise.prototype.done = function (didFulfill, didReject) {
    var promise =
        this._then(didFulfill, didReject, undefined, undefined, undefined);
    promise._setIsFinal();
};

Promise.prototype.spread = function (fn) {
    if (typeof fn !== "function") {
        return apiRejection("expecting a function but got " + util.classString(fn));
    }
    return this.all()._then(fn, undefined, undefined, APPLY, undefined);
};

Promise.prototype.toJSON = function () {
    var ret = {
        isFulfilled: false,
        isRejected: false,
        fulfillmentValue: undefined,
        rejectionReason: undefined
    };
    if (this.isFulfilled()) {
        ret.fulfillmentValue = this.value();
        ret.isFulfilled = true;
    } else if (this.isRejected()) {
        ret.rejectionReason = this.reason();
        ret.isRejected = true;
    }
    return ret;
};

Promise.prototype.all = function () {
    if (arguments.length > 0) {
        this._warn(".all() was passed arguments but it does not take any");
    }
    return new PromiseArray(this).promise();
};

Promise.prototype.error = function (fn) {
    return this.caught(util.originatesFromRejection, fn);
};

Promise.getNewLibraryCopy = module.exports;

Promise.is = function (val) {
    return val instanceof Promise;
};

Promise.fromNode = Promise.fromCallback = function(fn) {
    var ret = new Promise(INTERNAL);
    ret._captureStackTrace();
    var multiArgs = arguments.length > 1 ? !!Object(arguments[1]).multiArgs
                                         : false;
    var result = tryCatch(fn)(nodebackForPromise(ret, multiArgs));
    if (result === errorObj) {
        ret._rejectCallback(result.e, true);
    }
    if (!ret._isFateSealed()) ret._setAsyncGuaranteed();
    return ret;
};

Promise.all = function (promises) {
    return new PromiseArray(promises).promise();
};

Promise.cast = function (obj) {
    var ret = tryConvertToPromise(obj);
    if (!(ret instanceof Promise)) {
        ret = new Promise(INTERNAL);
        ret._captureStackTrace();
        ret._setFulfilled();
        ret._rejectionHandler0 = obj;
    }
    return ret;
};

Promise.resolve = Promise.fulfilled = Promise.cast;

Promise.reject = Promise.rejected = function (reason) {
    var ret = new Promise(INTERNAL);
    ret._captureStackTrace();
    ret._rejectCallback(reason, true);
    return ret;
};

Promise.setScheduler = function(fn) {
    if (typeof fn !== "function") {
        throw new TypeError("expecting a function but got " + util.classString(fn));
    }
    return async.setScheduler(fn);
};

Promise.prototype._then = function (
    didFulfill,
    didReject,
    _,    receiver,
    internalData
) {
    var haveInternalData = internalData !== undefined;
    var promise = haveInternalData ? internalData : new Promise(INTERNAL);
    var target = this._target();
    var bitField = target._bitField;

    if (!haveInternalData) {
        promise._propagateFrom(this, 3);
        promise._captureStackTrace();
        if (receiver === undefined &&
            ((this._bitField & 2097152) !== 0)) {
            if (!((bitField & 50397184) === 0)) {
                receiver = this._boundValue();
            } else {
                receiver = target === this ? undefined : this._boundTo;
            }
        }
        this._fireEvent("promiseChained", this, promise);
    }

    var domain = getDomain();
    if (!((bitField & 50397184) === 0)) {
        var handler, value, settler = target._settlePromiseCtx;
        if (((bitField & 33554432) !== 0)) {
            value = target._rejectionHandler0;
            handler = didFulfill;
        } else if (((bitField & 16777216) !== 0)) {
            value = target._fulfillmentHandler0;
            handler = didReject;
            target._unsetRejectionIsUnhandled();
        } else {
            settler = target._settlePromiseLateCancellationObserver;
            value = new CancellationError("late cancellation observer");
            target._attachExtraTrace(value);
            handler = didReject;
        }

        async.invoke(settler, target, {
            handler: domain === null ? handler
                : (typeof handler === "function" &&
                    util.domainBind(domain, handler)),
            promise: promise,
            receiver: receiver,
            value: value
        });
    } else {
        target._addCallbacks(didFulfill, didReject, promise, receiver, domain);
    }

    return promise;
};

Promise.prototype._length = function () {
    return this._bitField & 65535;
};

Promise.prototype._isFateSealed = function () {
    return (this._bitField & 117506048) !== 0;
};

Promise.prototype._isFollowing = function () {
    return (this._bitField & 67108864) === 67108864;
};

Promise.prototype._setLength = function (len) {
    this._bitField = (this._bitField & -65536) |
        (len & 65535);
};

Promise.prototype._setFulfilled = function () {
    this._bitField = this._bitField | 33554432;
    this._fireEvent("promiseFulfilled", this);
};

Promise.prototype._setRejected = function () {
    this._bitField = this._bitField | 16777216;
    this._fireEvent("promiseRejected", this);
};

Promise.prototype._setFollowing = function () {
    this._bitField = this._bitField | 67108864;
    this._fireEvent("promiseResolved", this);
};

Promise.prototype._setIsFinal = function () {
    this._bitField = this._bitField | 4194304;
};

Promise.prototype._isFinal = function () {
    return (this._bitField & 4194304) > 0;
};

Promise.prototype._unsetCancelled = function() {
    this._bitField = this._bitField & (~65536);
};

Promise.prototype._setCancelled = function() {
    this._bitField = this._bitField | 65536;
    this._fireEvent("promiseCancelled", this);
};

Promise.prototype._setWillBeCancelled = function() {
    this._bitField = this._bitField | 8388608;
};

Promise.prototype._setAsyncGuaranteed = function() {
    if (async.hasCustomScheduler()) return;
    this._bitField = this._bitField | 134217728;
};

Promise.prototype._receiverAt = function (index) {
    var ret = index === 0 ? this._receiver0 : this[
            index * 4 - 4 + 3];
    if (ret === UNDEFINED_BINDING) {
        return undefined;
    } else if (ret === undefined && this._isBound()) {
        return this._boundValue();
    }
    return ret;
};

Promise.prototype._promiseAt = function (index) {
    return this[
            index * 4 - 4 + 2];
};

Promise.prototype._fulfillmentHandlerAt = function (index) {
    return this[
            index * 4 - 4 + 0];
};

Promise.prototype._rejectionHandlerAt = function (index) {
    return this[
            index * 4 - 4 + 1];
};

Promise.prototype._boundValue = function() {};

Promise.prototype._migrateCallback0 = function (follower) {
    var bitField = follower._bitField;
    var fulfill = follower._fulfillmentHandler0;
    var reject = follower._rejectionHandler0;
    var promise = follower._promise0;
    var receiver = follower._receiverAt(0);
    if (receiver === undefined) receiver = UNDEFINED_BINDING;
    this._addCallbacks(fulfill, reject, promise, receiver, null);
};

Promise.prototype._migrateCallbackAt = function (follower, index) {
    var fulfill = follower._fulfillmentHandlerAt(index);
    var reject = follower._rejectionHandlerAt(index);
    var promise = follower._promiseAt(index);
    var receiver = follower._receiverAt(index);
    if (receiver === undefined) receiver = UNDEFINED_BINDING;
    this._addCallbacks(fulfill, reject, promise, receiver, null);
};

Promise.prototype._addCallbacks = function (
    fulfill,
    reject,
    promise,
    receiver,
    domain
) {
    var index = this._length();

    if (index >= 65535 - 4) {
        index = 0;
        this._setLength(0);
    }

    if (index === 0) {
        this._promise0 = promise;
        this._receiver0 = receiver;
        if (typeof fulfill === "function") {
            this._fulfillmentHandler0 =
                domain === null ? fulfill : util.domainBind(domain, fulfill);
        }
        if (typeof reject === "function") {
            this._rejectionHandler0 =
                domain === null ? reject : util.domainBind(domain, reject);
        }
    } else {
        var base = index * 4 - 4;
        this[base + 2] = promise;
        this[base + 3] = receiver;
        if (typeof fulfill === "function") {
            this[base + 0] =
                domain === null ? fulfill : util.domainBind(domain, fulfill);
        }
        if (typeof reject === "function") {
            this[base + 1] =
                domain === null ? reject : util.domainBind(domain, reject);
        }
    }
    this._setLength(index + 1);
    return index;
};

Promise.prototype._proxy = function (proxyable, arg) {
    this._addCallbacks(undefined, undefined, arg, proxyable, null);
};

Promise.prototype._resolveCallback = function(value, shouldBind) {
    if (((this._bitField & 117506048) !== 0)) return;
    if (value === this)
        return this._rejectCallback(makeSelfResolutionError(), false);
    var maybePromise = tryConvertToPromise(value, this);
    if (!(maybePromise instanceof Promise)) return this._fulfill(value);

    if (shouldBind) this._propagateFrom(maybePromise, 2);

    var promise = maybePromise._target();

    if (promise === this) {
        this._reject(makeSelfResolutionError());
        return;
    }

    var bitField = promise._bitField;
    if (((bitField & 50397184) === 0)) {
        var len = this._length();
        if (len > 0) promise._migrateCallback0(this);
        for (var i = 1; i < len; ++i) {
            promise._migrateCallbackAt(this, i);
        }
        this._setFollowing();
        this._setLength(0);
        this._setFollowee(promise);
    } else if (((bitField & 33554432) !== 0)) {
        this._fulfill(promise._value());
    } else if (((bitField & 16777216) !== 0)) {
        this._reject(promise._reason());
    } else {
        var reason = new CancellationError("late cancellation observer");
        promise._attachExtraTrace(reason);
        this._reject(reason);
    }
};

Promise.prototype._rejectCallback =
function(reason, synchronous, ignoreNonErrorWarnings) {
    var trace = util.ensureErrorObject(reason);
    var hasStack = trace === reason;
    if (!hasStack && !ignoreNonErrorWarnings && debug.warnings()) {
        var message = "a promise was rejected with a non-error: " +
            util.classString(reason);
        this._warn(message, true);
    }
    this._attachExtraTrace(trace, synchronous ? hasStack : false);
    this._reject(reason);
};

Promise.prototype._resolveFromExecutor = function (executor) {
    if (executor === INTERNAL) return;
    var promise = this;
    this._captureStackTrace();
    this._pushContext();
    var synchronous = true;
    var r = this._execute(executor, function(value) {
        promise._resolveCallback(value);
    }, function (reason) {
        promise._rejectCallback(reason, synchronous);
    });
    synchronous = false;
    this._popContext();

    if (r !== undefined) {
        promise._rejectCallback(r, true);
    }
};

Promise.prototype._settlePromiseFromHandler = function (
    handler, receiver, value, promise
) {
    var bitField = promise._bitField;
    if (((bitField & 65536) !== 0)) return;
    promise._pushContext();
    var x;
    if (receiver === APPLY) {
        if (!value || typeof value.length !== "number") {
            x = errorObj;
            x.e = new TypeError("cannot .spread() a non-array: " +
                                    util.classString(value));
        } else {
            x = tryCatch(handler).apply(this._boundValue(), value);
        }
    } else {
        x = tryCatch(handler).call(receiver, value);
    }
    var promiseCreated = promise._popContext();
    bitField = promise._bitField;
    if (((bitField & 65536) !== 0)) return;

    if (x === NEXT_FILTER) {
        promise._reject(value);
    } else if (x === errorObj) {
        promise._rejectCallback(x.e, false);
    } else {
        debug.checkForgottenReturns(x, promiseCreated, "",  promise, this);
        promise._resolveCallback(x);
    }
};

Promise.prototype._target = function() {
    var ret = this;
    while (ret._isFollowing()) ret = ret._followee();
    return ret;
};

Promise.prototype._followee = function() {
    return this._rejectionHandler0;
};

Promise.prototype._setFollowee = function(promise) {
    this._rejectionHandler0 = promise;
};

Promise.prototype._settlePromise = function(promise, handler, receiver, value) {
    var isPromise = promise instanceof Promise;
    var bitField = this._bitField;
    var asyncGuaranteed = ((bitField & 134217728) !== 0);
    if (((bitField & 65536) !== 0)) {
        if (isPromise) promise._invokeInternalOnCancel();

        if (receiver instanceof PassThroughHandlerContext &&
            receiver.isFinallyHandler()) {
            receiver.cancelPromise = promise;
            if (tryCatch(handler).call(receiver, value) === errorObj) {
                promise._reject(errorObj.e);
            }
        } else if (handler === reflectHandler) {
            promise._fulfill(reflectHandler.call(receiver));
        } else if (receiver instanceof Proxyable) {
            receiver._promiseCancelled(promise);
        } else if (isPromise || promise instanceof PromiseArray) {
            promise._cancel();
        } else {
            receiver.cancel();
        }
    } else if (typeof handler === "function") {
        if (!isPromise) {
            handler.call(receiver, value, promise);
        } else {
            if (asyncGuaranteed) promise._setAsyncGuaranteed();
            this._settlePromiseFromHandler(handler, receiver, value, promise);
        }
    } else if (receiver instanceof Proxyable) {
        if (!receiver._isResolved()) {
            if (((bitField & 33554432) !== 0)) {
                receiver._promiseFulfilled(value, promise);
            } else {
                receiver._promiseRejected(value, promise);
            }
        }
    } else if (isPromise) {
        if (asyncGuaranteed) promise._setAsyncGuaranteed();
        if (((bitField & 33554432) !== 0)) {
            promise._fulfill(value);
        } else {
            promise._reject(value);
        }
    }
};

Promise.prototype._settlePromiseLateCancellationObserver = function(ctx) {
    var handler = ctx.handler;
    var promise = ctx.promise;
    var receiver = ctx.receiver;
    var value = ctx.value;
    if (typeof handler === "function") {
        if (!(promise instanceof Promise)) {
            handler.call(receiver, value, promise);
        } else {
            this._settlePromiseFromHandler(handler, receiver, value, promise);
        }
    } else if (promise instanceof Promise) {
        promise._reject(value);
    }
};

Promise.prototype._settlePromiseCtx = function(ctx) {
    this._settlePromise(ctx.promise, ctx.handler, ctx.receiver, ctx.value);
};

Promise.prototype._settlePromise0 = function(handler, value, bitField) {
    var promise = this._promise0;
    var receiver = this._receiverAt(0);
    this._promise0 = undefined;
    this._receiver0 = undefined;
    this._settlePromise(promise, handler, receiver, value);
};

Promise.prototype._clearCallbackDataAtIndex = function(index) {
    var base = index * 4 - 4;
    this[base + 2] =
    this[base + 3] =
    this[base + 0] =
    this[base + 1] = undefined;
};

Promise.prototype._fulfill = function (value) {
    var bitField = this._bitField;
    if (((bitField & 117506048) >>> 16)) return;
    if (value === this) {
        var err = makeSelfResolutionError();
        this._attachExtraTrace(err);
        return this._reject(err);
    }
    this._setFulfilled();
    this._rejectionHandler0 = value;

    if ((bitField & 65535) > 0) {
        if (((bitField & 134217728) !== 0)) {
            this._settlePromises();
        } else {
            async.settlePromises(this);
        }
        this._dereferenceTrace();
    }
};

Promise.prototype._reject = function (reason) {
    var bitField = this._bitField;
    if (((bitField & 117506048) >>> 16)) return;
    this._setRejected();
    this._fulfillmentHandler0 = reason;

    if (this._isFinal()) {
        return async.fatalError(reason, util.isNode);
    }

    if ((bitField & 65535) > 0) {
        async.settlePromises(this);
    } else {
        this._ensurePossibleRejectionHandled();
    }
};

Promise.prototype._fulfillPromises = function (len, value) {
    for (var i = 1; i < len; i++) {
        var handler = this._fulfillmentHandlerAt(i);
        var promise = this._promiseAt(i);
        var receiver = this._receiverAt(i);
        this._clearCallbackDataAtIndex(i);
        this._settlePromise(promise, handler, receiver, value);
    }
};

Promise.prototype._rejectPromises = function (len, reason) {
    for (var i = 1; i < len; i++) {
        var handler = this._rejectionHandlerAt(i);
        var promise = this._promiseAt(i);
        var receiver = this._receiverAt(i);
        this._clearCallbackDataAtIndex(i);
        this._settlePromise(promise, handler, receiver, reason);
    }
};

Promise.prototype._settlePromises = function () {
    var bitField = this._bitField;
    var len = (bitField & 65535);

    if (len > 0) {
        if (((bitField & 16842752) !== 0)) {
            var reason = this._fulfillmentHandler0;
            this._settlePromise0(this._rejectionHandler0, reason, bitField);
            this._rejectPromises(len, reason);
        } else {
            var value = this._rejectionHandler0;
            this._settlePromise0(this._fulfillmentHandler0, value, bitField);
            this._fulfillPromises(len, value);
        }
        this._setLength(0);
    }
    this._clearCancellationData();
};

Promise.prototype._settledValue = function() {
    var bitField = this._bitField;
    if (((bitField & 33554432) !== 0)) {
        return this._rejectionHandler0;
    } else if (((bitField & 16777216) !== 0)) {
        return this._fulfillmentHandler0;
    }
};

function deferResolve(v) {this.promise._resolveCallback(v);}
function deferReject(v) {this.promise._rejectCallback(v, false);}

Promise.defer = Promise.pending = function() {
    debug.deprecated("Promise.defer", "new Promise");
    var promise = new Promise(INTERNAL);
    return {
        promise: promise,
        resolve: deferResolve,
        reject: deferReject
    };
};

util.notEnumerableProp(Promise,
                       "_makeSelfResolutionError",
                       makeSelfResolutionError);

_dereq_("./method")(Promise, INTERNAL, tryConvertToPromise, apiRejection,
    debug);
_dereq_("./bind")(Promise, INTERNAL, tryConvertToPromise, debug);
_dereq_("./cancel")(Promise, PromiseArray, apiRejection, debug);
_dereq_("./direct_resolve")(Promise);
_dereq_("./synchronous_inspection")(Promise);
_dereq_("./join")(
    Promise, PromiseArray, tryConvertToPromise, INTERNAL, async, getDomain);
Promise.Promise = Promise;
Promise.version = "3.5.4";
_dereq_('./map.js')(Promise, PromiseArray, apiRejection, tryConvertToPromise, INTERNAL, debug);
_dereq_('./call_get.js')(Promise);
_dereq_('./using.js')(Promise, apiRejection, tryConvertToPromise, createContext, INTERNAL, debug);
_dereq_('./timers.js')(Promise, INTERNAL, debug);
_dereq_('./generators.js')(Promise, apiRejection, INTERNAL, tryConvertToPromise, Proxyable, debug);
_dereq_('./nodeify.js')(Promise);
_dereq_('./promisify.js')(Promise, INTERNAL);
_dereq_('./props.js')(Promise, PromiseArray, tryConvertToPromise, apiRejection);
_dereq_('./race.js')(Promise, INTERNAL, tryConvertToPromise, apiRejection);
_dereq_('./reduce.js')(Promise, PromiseArray, apiRejection, tryConvertToPromise, INTERNAL, debug);
_dereq_('./settle.js')(Promise, PromiseArray, debug);
_dereq_('./some.js')(Promise, PromiseArray, apiRejection);
_dereq_('./filter.js')(Promise, INTERNAL);
_dereq_('./each.js')(Promise, INTERNAL);
_dereq_('./any.js')(Promise);
                                                         
    util.toFastProperties(Promise);                                          
    util.toFastProperties(Promise.prototype);                                
    function fillTypes(value) {                                              
        var p = new Promise(INTERNAL);                                       
        p._fulfillmentHandler0 = value;                                      
        p._rejectionHandler0 = value;                                        
        p._promise0 = value;                                                 
        p._receiver0 = value;                                                
    }                                                                        
    // Complete slack tracking, opt out of field-type tracking and           
    // stabilize map                                                         
    fillTypes({a: 1});                                                       
    fillTypes({b: 2});                                                       
    fillTypes({c: 3});                                                       
    fillTypes(1);                                                            
    fillTypes(function(){});                                                 
    fillTypes(undefined);                                                    
    fillTypes(false);                                                        
    fillTypes(new Promise(INTERNAL));                                        
    debug.setBounds(Async.firstLineError, util.lastLineError);               
    return Promise;                                                          

};

},{"./any.js":1,"./async":2,"./bind":3,"./call_get.js":5,"./cancel":6,"./catch_filter":7,"./context":8,"./debuggability":9,"./direct_resolve":10,"./each.js":11,"./errors":12,"./es5":13,"./filter.js":14,"./finally":15,"./generators.js":16,"./join":17,"./map.js":18,"./method":19,"./nodeback":20,"./nodeify.js":21,"./promise_array":23,"./promisify.js":24,"./props.js":25,"./race.js":27,"./reduce.js":28,"./settle.js":30,"./some.js":31,"./synchronous_inspection":32,"./thenables":33,"./timers.js":34,"./using.js":35,"./util":36}],23:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise, INTERNAL, tryConvertToPromise,
    apiRejection, Proxyable) {
var util = _dereq_("./util");
var isArray = util.isArray;

function toResolutionValue(val) {
    switch(val) {
    case -2: return [];
    case -3: return {};
    case -6: return new Map();
    }
}

function PromiseArray(values) {
    var promise = this._promise = new Promise(INTERNAL);
    if (values instanceof Promise) {
        promise._propagateFrom(values, 3);
    }
    promise._setOnCancel(this);
    this._values = values;
    this._length = 0;
    this._totalResolved = 0;
    this._init(undefined, -2);
}
util.inherits(PromiseArray, Proxyable);

PromiseArray.prototype.length = function () {
    return this._length;
};

PromiseArray.prototype.promise = function () {
    return this._promise;
};

PromiseArray.prototype._init = function init(_, resolveValueIfEmpty) {
    var values = tryConvertToPromise(this._values, this._promise);
    if (values instanceof Promise) {
        values = values._target();
        var bitField = values._bitField;
        ;
        this._values = values;

        if (((bitField & 50397184) === 0)) {
            this._promise._setAsyncGuaranteed();
            return values._then(
                init,
                this._reject,
                undefined,
                this,
                resolveValueIfEmpty
           );
        } else if (((bitField & 33554432) !== 0)) {
            values = values._value();
        } else if (((bitField & 16777216) !== 0)) {
            return this._reject(values._reason());
        } else {
            return this._cancel();
        }
    }
    values = util.asArray(values);
    if (values === null) {
        var err = apiRejection(
            "expecting an array or an iterable object but got " + util.classString(values)).reason();
        this._promise._rejectCallback(err, false);
        return;
    }

    if (values.length === 0) {
        if (resolveValueIfEmpty === -5) {
            this._resolveEmptyArray();
        }
        else {
            this._resolve(toResolutionValue(resolveValueIfEmpty));
        }
        return;
    }
    this._iterate(values);
};

PromiseArray.prototype._iterate = function(values) {
    var len = this.getActualLength(values.length);
    this._length = len;
    this._values = this.shouldCopyValues() ? new Array(len) : this._values;
    var result = this._promise;
    var isResolved = false;
    var bitField = null;
    for (var i = 0; i < len; ++i) {
        var maybePromise = tryConvertToPromise(values[i], result);

        if (maybePromise instanceof Promise) {
            maybePromise = maybePromise._target();
            bitField = maybePromise._bitField;
        } else {
            bitField = null;
        }

        if (isResolved) {
            if (bitField !== null) {
                maybePromise.suppressUnhandledRejections();
            }
        } else if (bitField !== null) {
            if (((bitField & 50397184) === 0)) {
                maybePromise._proxy(this, i);
                this._values[i] = maybePromise;
            } else if (((bitField & 33554432) !== 0)) {
                isResolved = this._promiseFulfilled(maybePromise._value(), i);
            } else if (((bitField & 16777216) !== 0)) {
                isResolved = this._promiseRejected(maybePromise._reason(), i);
            } else {
                isResolved = this._promiseCancelled(i);
            }
        } else {
            isResolved = this._promiseFulfilled(maybePromise, i);
        }
    }
    if (!isResolved) result._setAsyncGuaranteed();
};

PromiseArray.prototype._isResolved = function () {
    return this._values === null;
};

PromiseArray.prototype._resolve = function (value) {
    this._values = null;
    this._promise._fulfill(value);
};

PromiseArray.prototype._cancel = function() {
    if (this._isResolved() || !this._promise._isCancellable()) return;
    this._values = null;
    this._promise._cancel();
};

PromiseArray.prototype._reject = function (reason) {
    this._values = null;
    this._promise._rejectCallback(reason, false);
};

PromiseArray.prototype._promiseFulfilled = function (value, index) {
    this._values[index] = value;
    var totalResolved = ++this._totalResolved;
    if (totalResolved >= this._length) {
        this._resolve(this._values);
        return true;
    }
    return false;
};

PromiseArray.prototype._promiseCancelled = function() {
    this._cancel();
    return true;
};

PromiseArray.prototype._promiseRejected = function (reason) {
    this._totalResolved++;
    this._reject(reason);
    return true;
};

PromiseArray.prototype._resultCancelled = function() {
    if (this._isResolved()) return;
    var values = this._values;
    this._cancel();
    if (values instanceof Promise) {
        values.cancel();
    } else {
        for (var i = 0; i < values.length; ++i) {
            if (values[i] instanceof Promise) {
                values[i].cancel();
            }
        }
    }
};

PromiseArray.prototype.shouldCopyValues = function () {
    return true;
};

PromiseArray.prototype.getActualLength = function (len) {
    return len;
};

return PromiseArray;
};

},{"./util":36}],24:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise, INTERNAL) {
var THIS = {};
var util = _dereq_("./util");
var nodebackForPromise = _dereq_("./nodeback");
var withAppended = util.withAppended;
var maybeWrapAsError = util.maybeWrapAsError;
var canEvaluate = util.canEvaluate;
var TypeError = _dereq_("./errors").TypeError;
var defaultSuffix = "Async";
var defaultPromisified = {__isPromisified__: true};
var noCopyProps = [
    "arity",    "length",
    "name",
    "arguments",
    "caller",
    "callee",
    "prototype",
    "__isPromisified__"
];
var noCopyPropsPattern = new RegExp("^(?:" + noCopyProps.join("|") + ")$");

var defaultFilter = function(name) {
    return util.isIdentifier(name) &&
        name.charAt(0) !== "_" &&
        name !== "constructor";
};

function propsFilter(key) {
    return !noCopyPropsPattern.test(key);
}

function isPromisified(fn) {
    try {
        return fn.__isPromisified__ === true;
    }
    catch (e) {
        return false;
    }
}

function hasPromisified(obj, key, suffix) {
    var val = util.getDataPropertyOrDefault(obj, key + suffix,
                                            defaultPromisified);
    return val ? isPromisified(val) : false;
}
function checkValid(ret, suffix, suffixRegexp) {
    for (var i = 0; i < ret.length; i += 2) {
        var key = ret[i];
        if (suffixRegexp.test(key)) {
            var keyWithoutAsyncSuffix = key.replace(suffixRegexp, "");
            for (var j = 0; j < ret.length; j += 2) {
                if (ret[j] === keyWithoutAsyncSuffix) {
                    throw new TypeError("Cannot promisify an API that has normal methods with '%s'-suffix\u000a\u000a    See http://goo.gl/MqrFmX\u000a"
                        .replace("%s", suffix));
                }
            }
        }
    }
}

function promisifiableMethods(obj, suffix, suffixRegexp, filter) {
    var keys = util.inheritedDataKeys(obj);
    var ret = [];
    for (var i = 0; i < keys.length; ++i) {
        var key = keys[i];
        var value = obj[key];
        var passesDefaultFilter = filter === defaultFilter
            ? true : defaultFilter(key, value, obj);
        if (typeof value === "function" &&
            !isPromisified(value) &&
            !hasPromisified(obj, key, suffix) &&
            filter(key, value, obj, passesDefaultFilter)) {
            ret.push(key, value);
        }
    }
    checkValid(ret, suffix, suffixRegexp);
    return ret;
}

var escapeIdentRegex = function(str) {
    return str.replace(/([$])/, "\\$");
};

var makeNodePromisifiedEval;
if (!true) {
var switchCaseArgumentOrder = function(likelyArgumentCount) {
    var ret = [likelyArgumentCount];
    var min = Math.max(0, likelyArgumentCount - 1 - 3);
    for(var i = likelyArgumentCount - 1; i >= min; --i) {
        ret.push(i);
    }
    for(var i = likelyArgumentCount + 1; i <= 3; ++i) {
        ret.push(i);
    }
    return ret;
};

var argumentSequence = function(argumentCount) {
    return util.filledRange(argumentCount, "_arg", "");
};

var parameterDeclaration = function(parameterCount) {
    return util.filledRange(
        Math.max(parameterCount, 3), "_arg", "");
};

var parameterCount = function(fn) {
    if (typeof fn.length === "number") {
        return Math.max(Math.min(fn.length, 1023 + 1), 0);
    }
    return 0;
};

makeNodePromisifiedEval =
function(callback, receiver, originalName, fn, _, multiArgs) {
    var newParameterCount = Math.max(0, parameterCount(fn) - 1);
    var argumentOrder = switchCaseArgumentOrder(newParameterCount);
    var shouldProxyThis = typeof callback === "string" || receiver === THIS;

    function generateCallForArgumentCount(count) {
        var args = argumentSequence(count).join(", ");
        var comma = count > 0 ? ", " : "";
        var ret;
        if (shouldProxyThis) {
            ret = "ret = callback.call(this, {{args}}, nodeback); break;\n";
        } else {
            ret = receiver === undefined
                ? "ret = callback({{args}}, nodeback); break;\n"
                : "ret = callback.call(receiver, {{args}}, nodeback); break;\n";
        }
        return ret.replace("{{args}}", args).replace(", ", comma);
    }

    function generateArgumentSwitchCase() {
        var ret = "";
        for (var i = 0; i < argumentOrder.length; ++i) {
            ret += "case " + argumentOrder[i] +":" +
                generateCallForArgumentCount(argumentOrder[i]);
        }

        ret += "                                                             \n\
        default:                                                             \n\
            var args = new Array(len + 1);                                   \n\
            var i = 0;                                                       \n\
            for (var i = 0; i < len; ++i) {                                  \n\
               args[i] = arguments[i];                                       \n\
            }                                                                \n\
            args[i] = nodeback;                                              \n\
            [CodeForCall]                                                    \n\
            break;                                                           \n\
        ".replace("[CodeForCall]", (shouldProxyThis
                                ? "ret = callback.apply(this, args);\n"
                                : "ret = callback.apply(receiver, args);\n"));
        return ret;
    }

    var getFunctionCode = typeof callback === "string"
                                ? ("this != null ? this['"+callback+"'] : fn")
                                : "fn";
    var body = "'use strict';                                                \n\
        var ret = function (Parameters) {                                    \n\
            'use strict';                                                    \n\
            var len = arguments.length;                                      \n\
            var promise = new Promise(INTERNAL);                             \n\
            promise._captureStackTrace();                                    \n\
            var nodeback = nodebackForPromise(promise, " + multiArgs + ");   \n\
            var ret;                                                         \n\
            var callback = tryCatch([GetFunctionCode]);                      \n\
            switch(len) {                                                    \n\
                [CodeForSwitchCase]                                          \n\
            }                                                                \n\
            if (ret === errorObj) {                                          \n\
                promise._rejectCallback(maybeWrapAsError(ret.e), true, true);\n\
            }                                                                \n\
            if (!promise._isFateSealed()) promise._setAsyncGuaranteed();     \n\
            return promise;                                                  \n\
        };                                                                   \n\
        notEnumerableProp(ret, '__isPromisified__', true);                   \n\
        return ret;                                                          \n\
    ".replace("[CodeForSwitchCase]", generateArgumentSwitchCase())
        .replace("[GetFunctionCode]", getFunctionCode);
    body = body.replace("Parameters", parameterDeclaration(newParameterCount));
    return new Function("Promise",
                        "fn",
                        "receiver",
                        "withAppended",
                        "maybeWrapAsError",
                        "nodebackForPromise",
                        "tryCatch",
                        "errorObj",
                        "notEnumerableProp",
                        "INTERNAL",
                        body)(
                    Promise,
                    fn,
                    receiver,
                    withAppended,
                    maybeWrapAsError,
                    nodebackForPromise,
                    util.tryCatch,
                    util.errorObj,
                    util.notEnumerableProp,
                    INTERNAL);
};
}

function makeNodePromisifiedClosure(callback, receiver, _, fn, __, multiArgs) {
    var defaultThis = (function() {return this;})();
    var method = callback;
    if (typeof method === "string") {
        callback = fn;
    }
    function promisified() {
        var _receiver = receiver;
        if (receiver === THIS) _receiver = this;
        var promise = new Promise(INTERNAL);
        promise._captureStackTrace();
        var cb = typeof method === "string" && this !== defaultThis
            ? this[method] : callback;
        var fn = nodebackForPromise(promise, multiArgs);
        try {
            cb.apply(_receiver, withAppended(arguments, fn));
        } catch(e) {
            promise._rejectCallback(maybeWrapAsError(e), true, true);
        }
        if (!promise._isFateSealed()) promise._setAsyncGuaranteed();
        return promise;
    }
    util.notEnumerableProp(promisified, "__isPromisified__", true);
    return promisified;
}

var makeNodePromisified = canEvaluate
    ? makeNodePromisifiedEval
    : makeNodePromisifiedClosure;

function promisifyAll(obj, suffix, filter, promisifier, multiArgs) {
    var suffixRegexp = new RegExp(escapeIdentRegex(suffix) + "$");
    var methods =
        promisifiableMethods(obj, suffix, suffixRegexp, filter);

    for (var i = 0, len = methods.length; i < len; i+= 2) {
        var key = methods[i];
        var fn = methods[i+1];
        var promisifiedKey = key + suffix;
        if (promisifier === makeNodePromisified) {
            obj[promisifiedKey] =
                makeNodePromisified(key, THIS, key, fn, suffix, multiArgs);
        } else {
            var promisified = promisifier(fn, function() {
                return makeNodePromisified(key, THIS, key,
                                           fn, suffix, multiArgs);
            });
            util.notEnumerableProp(promisified, "__isPromisified__", true);
            obj[promisifiedKey] = promisified;
        }
    }
    util.toFastProperties(obj);
    return obj;
}

function promisify(callback, receiver, multiArgs) {
    return makeNodePromisified(callback, receiver, undefined,
                                callback, null, multiArgs);
}

Promise.promisify = function (fn, options) {
    if (typeof fn !== "function") {
        throw new TypeError("expecting a function but got " + util.classString(fn));
    }
    if (isPromisified(fn)) {
        return fn;
    }
    options = Object(options);
    var receiver = options.context === undefined ? THIS : options.context;
    var multiArgs = !!options.multiArgs;
    var ret = promisify(fn, receiver, multiArgs);
    util.copyDescriptors(fn, ret, propsFilter);
    return ret;
};

Promise.promisifyAll = function (target, options) {
    if (typeof target !== "function" && typeof target !== "object") {
        throw new TypeError("the target of promisifyAll must be an object or a function\u000a\u000a    See http://goo.gl/MqrFmX\u000a");
    }
    options = Object(options);
    var multiArgs = !!options.multiArgs;
    var suffix = options.suffix;
    if (typeof suffix !== "string") suffix = defaultSuffix;
    var filter = options.filter;
    if (typeof filter !== "function") filter = defaultFilter;
    var promisifier = options.promisifier;
    if (typeof promisifier !== "function") promisifier = makeNodePromisified;

    if (!util.isIdentifier(suffix)) {
        throw new RangeError("suffix must be a valid identifier\u000a\u000a    See http://goo.gl/MqrFmX\u000a");
    }

    var keys = util.inheritedDataKeys(target);
    for (var i = 0; i < keys.length; ++i) {
        var value = target[keys[i]];
        if (keys[i] !== "constructor" &&
            util.isClass(value)) {
            promisifyAll(value.prototype, suffix, filter, promisifier,
                multiArgs);
            promisifyAll(value, suffix, filter, promisifier, multiArgs);
        }
    }

    return promisifyAll(target, suffix, filter, promisifier, multiArgs);
};
};


},{"./errors":12,"./nodeback":20,"./util":36}],25:[function(_dereq_,module,exports){
"use strict";
module.exports = function(
    Promise, PromiseArray, tryConvertToPromise, apiRejection) {
var util = _dereq_("./util");
var isObject = util.isObject;
var es5 = _dereq_("./es5");
var Es6Map;
if (typeof Map === "function") Es6Map = Map;

var mapToEntries = (function() {
    var index = 0;
    var size = 0;

    function extractEntry(value, key) {
        this[index] = value;
        this[index + size] = key;
        index++;
    }

    return function mapToEntries(map) {
        size = map.size;
        index = 0;
        var ret = new Array(map.size * 2);
        map.forEach(extractEntry, ret);
        return ret;
    };
})();

var entriesToMap = function(entries) {
    var ret = new Es6Map();
    var length = entries.length / 2 | 0;
    for (var i = 0; i < length; ++i) {
        var key = entries[length + i];
        var value = entries[i];
        ret.set(key, value);
    }
    return ret;
};

function PropertiesPromiseArray(obj) {
    var isMap = false;
    var entries;
    if (Es6Map !== undefined && obj instanceof Es6Map) {
        entries = mapToEntries(obj);
        isMap = true;
    } else {
        var keys = es5.keys(obj);
        var len = keys.length;
        entries = new Array(len * 2);
        for (var i = 0; i < len; ++i) {
            var key = keys[i];
            entries[i] = obj[key];
            entries[i + len] = key;
        }
    }
    this.constructor$(entries);
    this._isMap = isMap;
    this._init$(undefined, isMap ? -6 : -3);
}
util.inherits(PropertiesPromiseArray, PromiseArray);

PropertiesPromiseArray.prototype._init = function () {};

PropertiesPromiseArray.prototype._promiseFulfilled = function (value, index) {
    this._values[index] = value;
    var totalResolved = ++this._totalResolved;
    if (totalResolved >= this._length) {
        var val;
        if (this._isMap) {
            val = entriesToMap(this._values);
        } else {
            val = {};
            var keyOffset = this.length();
            for (var i = 0, len = this.length(); i < len; ++i) {
                val[this._values[i + keyOffset]] = this._values[i];
            }
        }
        this._resolve(val);
        return true;
    }
    return false;
};

PropertiesPromiseArray.prototype.shouldCopyValues = function () {
    return false;
};

PropertiesPromiseArray.prototype.getActualLength = function (len) {
    return len >> 1;
};

function props(promises) {
    var ret;
    var castValue = tryConvertToPromise(promises);

    if (!isObject(castValue)) {
        return apiRejection("cannot await properties of a non-object\u000a\u000a    See http://goo.gl/MqrFmX\u000a");
    } else if (castValue instanceof Promise) {
        ret = castValue._then(
            Promise.props, undefined, undefined, undefined, undefined);
    } else {
        ret = new PropertiesPromiseArray(castValue).promise();
    }

    if (castValue instanceof Promise) {
        ret._propagateFrom(castValue, 2);
    }
    return ret;
}

Promise.prototype.props = function () {
    return props(this);
};

Promise.props = function (promises) {
    return props(promises);
};
};

},{"./es5":13,"./util":36}],26:[function(_dereq_,module,exports){
"use strict";
function arrayMove(src, srcIndex, dst, dstIndex, len) {
    for (var j = 0; j < len; ++j) {
        dst[j + dstIndex] = src[j + srcIndex];
        src[j + srcIndex] = void 0;
    }
}

function Queue(capacity) {
    this._capacity = capacity;
    this._length = 0;
    this._front = 0;
}

Queue.prototype._willBeOverCapacity = function (size) {
    return this._capacity < size;
};

Queue.prototype._pushOne = function (arg) {
    var length = this.length();
    this._checkCapacity(length + 1);
    var i = (this._front + length) & (this._capacity - 1);
    this[i] = arg;
    this._length = length + 1;
};

Queue.prototype.push = function (fn, receiver, arg) {
    var length = this.length() + 3;
    if (this._willBeOverCapacity(length)) {
        this._pushOne(fn);
        this._pushOne(receiver);
        this._pushOne(arg);
        return;
    }
    var j = this._front + length - 3;
    this._checkCapacity(length);
    var wrapMask = this._capacity - 1;
    this[(j + 0) & wrapMask] = fn;
    this[(j + 1) & wrapMask] = receiver;
    this[(j + 2) & wrapMask] = arg;
    this._length = length;
};

Queue.prototype.shift = function () {
    var front = this._front,
        ret = this[front];

    this[front] = undefined;
    this._front = (front + 1) & (this._capacity - 1);
    this._length--;
    return ret;
};

Queue.prototype.length = function () {
    return this._length;
};

Queue.prototype._checkCapacity = function (size) {
    if (this._capacity < size) {
        this._resizeTo(this._capacity << 1);
    }
};

Queue.prototype._resizeTo = function (capacity) {
    var oldCapacity = this._capacity;
    this._capacity = capacity;
    var front = this._front;
    var length = this._length;
    var moveItemsCount = (front + length) & (oldCapacity - 1);
    arrayMove(this, 0, this, oldCapacity, moveItemsCount);
};

module.exports = Queue;

},{}],27:[function(_dereq_,module,exports){
"use strict";
module.exports = function(
    Promise, INTERNAL, tryConvertToPromise, apiRejection) {
var util = _dereq_("./util");

var raceLater = function (promise) {
    return promise.then(function(array) {
        return race(array, promise);
    });
};

function race(promises, parent) {
    var maybePromise = tryConvertToPromise(promises);

    if (maybePromise instanceof Promise) {
        return raceLater(maybePromise);
    } else {
        promises = util.asArray(promises);
        if (promises === null)
            return apiRejection("expecting an array or an iterable object but got " + util.classString(promises));
    }

    var ret = new Promise(INTERNAL);
    if (parent !== undefined) {
        ret._propagateFrom(parent, 3);
    }
    var fulfill = ret._fulfill;
    var reject = ret._reject;
    for (var i = 0, len = promises.length; i < len; ++i) {
        var val = promises[i];

        if (val === undefined && !(i in promises)) {
            continue;
        }

        Promise.cast(val)._then(fulfill, reject, undefined, ret, null);
    }
    return ret;
}

Promise.race = function (promises) {
    return race(promises, undefined);
};

Promise.prototype.race = function () {
    return race(this, undefined);
};

};

},{"./util":36}],28:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise,
                          PromiseArray,
                          apiRejection,
                          tryConvertToPromise,
                          INTERNAL,
                          debug) {
var getDomain = Promise._getDomain;
var util = _dereq_("./util");
var tryCatch = util.tryCatch;

function ReductionPromiseArray(promises, fn, initialValue, _each) {
    this.constructor$(promises);
    var domain = getDomain();
    this._fn = domain === null ? fn : util.domainBind(domain, fn);
    if (initialValue !== undefined) {
        initialValue = Promise.resolve(initialValue);
        initialValue._attachCancellationCallback(this);
    }
    this._initialValue = initialValue;
    this._currentCancellable = null;
    if(_each === INTERNAL) {
        this._eachValues = Array(this._length);
    } else if (_each === 0) {
        this._eachValues = null;
    } else {
        this._eachValues = undefined;
    }
    this._promise._captureStackTrace();
    this._init$(undefined, -5);
}
util.inherits(ReductionPromiseArray, PromiseArray);

ReductionPromiseArray.prototype._gotAccum = function(accum) {
    if (this._eachValues !== undefined && 
        this._eachValues !== null && 
        accum !== INTERNAL) {
        this._eachValues.push(accum);
    }
};

ReductionPromiseArray.prototype._eachComplete = function(value) {
    if (this._eachValues !== null) {
        this._eachValues.push(value);
    }
    return this._eachValues;
};

ReductionPromiseArray.prototype._init = function() {};

ReductionPromiseArray.prototype._resolveEmptyArray = function() {
    this._resolve(this._eachValues !== undefined ? this._eachValues
                                                 : this._initialValue);
};

ReductionPromiseArray.prototype.shouldCopyValues = function () {
    return false;
};

ReductionPromiseArray.prototype._resolve = function(value) {
    this._promise._resolveCallback(value);
    this._values = null;
};

ReductionPromiseArray.prototype._resultCancelled = function(sender) {
    if (sender === this._initialValue) return this._cancel();
    if (this._isResolved()) return;
    this._resultCancelled$();
    if (this._currentCancellable instanceof Promise) {
        this._currentCancellable.cancel();
    }
    if (this._initialValue instanceof Promise) {
        this._initialValue.cancel();
    }
};

ReductionPromiseArray.prototype._iterate = function (values) {
    this._values = values;
    var value;
    var i;
    var length = values.length;
    if (this._initialValue !== undefined) {
        value = this._initialValue;
        i = 0;
    } else {
        value = Promise.resolve(values[0]);
        i = 1;
    }

    this._currentCancellable = value;

    if (!value.isRejected()) {
        for (; i < length; ++i) {
            var ctx = {
                accum: null,
                value: values[i],
                index: i,
                length: length,
                array: this
            };
            value = value._then(gotAccum, undefined, undefined, ctx, undefined);
        }
    }

    if (this._eachValues !== undefined) {
        value = value
            ._then(this._eachComplete, undefined, undefined, this, undefined);
    }
    value._then(completed, completed, undefined, value, this);
};

Promise.prototype.reduce = function (fn, initialValue) {
    return reduce(this, fn, initialValue, null);
};

Promise.reduce = function (promises, fn, initialValue, _each) {
    return reduce(promises, fn, initialValue, _each);
};

function completed(valueOrReason, array) {
    if (this.isFulfilled()) {
        array._resolve(valueOrReason);
    } else {
        array._reject(valueOrReason);
    }
}

function reduce(promises, fn, initialValue, _each) {
    if (typeof fn !== "function") {
        return apiRejection("expecting a function but got " + util.classString(fn));
    }
    var array = new ReductionPromiseArray(promises, fn, initialValue, _each);
    return array.promise();
}

function gotAccum(accum) {
    this.accum = accum;
    this.array._gotAccum(accum);
    var value = tryConvertToPromise(this.value, this.array._promise);
    if (value instanceof Promise) {
        this.array._currentCancellable = value;
        return value._then(gotValue, undefined, undefined, this, undefined);
    } else {
        return gotValue.call(this, value);
    }
}

function gotValue(value) {
    var array = this.array;
    var promise = array._promise;
    var fn = tryCatch(array._fn);
    promise._pushContext();
    var ret;
    if (array._eachValues !== undefined) {
        ret = fn.call(promise._boundValue(), value, this.index, this.length);
    } else {
        ret = fn.call(promise._boundValue(),
                              this.accum, value, this.index, this.length);
    }
    if (ret instanceof Promise) {
        array._currentCancellable = ret;
    }
    var promiseCreated = promise._popContext();
    debug.checkForgottenReturns(
        ret,
        promiseCreated,
        array._eachValues !== undefined ? "Promise.each" : "Promise.reduce",
        promise
    );
    return ret;
}
};

},{"./util":36}],29:[function(_dereq_,module,exports){
"use strict";
var util = _dereq_("./util");
var schedule;
var noAsyncScheduler = function() {
    throw new Error("No async scheduler available\u000a\u000a    See http://goo.gl/MqrFmX\u000a");
};
var NativePromise = util.getNativePromise();
if (util.isNode && typeof MutationObserver === "undefined") {
    var GlobalSetImmediate = global.setImmediate;
    var ProcessNextTick = process.nextTick;
    schedule = util.isRecentNode
                ? function(fn) { GlobalSetImmediate.call(global, fn); }
                : function(fn) { ProcessNextTick.call(process, fn); };
} else if (typeof NativePromise === "function" &&
           typeof NativePromise.resolve === "function") {
    var nativePromise = NativePromise.resolve();
    schedule = function(fn) {
        nativePromise.then(fn);
    };
} else if ((typeof MutationObserver !== "undefined") &&
          !(typeof window !== "undefined" &&
            window.navigator &&
            (window.navigator.standalone || window.cordova))) {
    schedule = (function() {
        var div = document.createElement("div");
        var opts = {attributes: true};
        var toggleScheduled = false;
        var div2 = document.createElement("div");
        var o2 = new MutationObserver(function() {
            div.classList.toggle("foo");
            toggleScheduled = false;
        });
        o2.observe(div2, opts);

        var scheduleToggle = function() {
            if (toggleScheduled) return;
            toggleScheduled = true;
            div2.classList.toggle("foo");
        };

        return function schedule(fn) {
            var o = new MutationObserver(function() {
                o.disconnect();
                fn();
            });
            o.observe(div, opts);
            scheduleToggle();
        };
    })();
} else if (typeof setImmediate !== "undefined") {
    schedule = function (fn) {
        setImmediate(fn);
    };
} else if (typeof setTimeout !== "undefined") {
    schedule = function (fn) {
        setTimeout(fn, 0);
    };
} else {
    schedule = noAsyncScheduler;
}
module.exports = schedule;

},{"./util":36}],30:[function(_dereq_,module,exports){
"use strict";
module.exports =
    function(Promise, PromiseArray, debug) {
var PromiseInspection = Promise.PromiseInspection;
var util = _dereq_("./util");

function SettledPromiseArray(values) {
    this.constructor$(values);
}
util.inherits(SettledPromiseArray, PromiseArray);

SettledPromiseArray.prototype._promiseResolved = function (index, inspection) {
    this._values[index] = inspection;
    var totalResolved = ++this._totalResolved;
    if (totalResolved >= this._length) {
        this._resolve(this._values);
        return true;
    }
    return false;
};

SettledPromiseArray.prototype._promiseFulfilled = function (value, index) {
    var ret = new PromiseInspection();
    ret._bitField = 33554432;
    ret._settledValueField = value;
    return this._promiseResolved(index, ret);
};
SettledPromiseArray.prototype._promiseRejected = function (reason, index) {
    var ret = new PromiseInspection();
    ret._bitField = 16777216;
    ret._settledValueField = reason;
    return this._promiseResolved(index, ret);
};

Promise.settle = function (promises) {
    debug.deprecated(".settle()", ".reflect()");
    return new SettledPromiseArray(promises).promise();
};

Promise.prototype.settle = function () {
    return Promise.settle(this);
};
};

},{"./util":36}],31:[function(_dereq_,module,exports){
"use strict";
module.exports =
function(Promise, PromiseArray, apiRejection) {
var util = _dereq_("./util");
var RangeError = _dereq_("./errors").RangeError;
var AggregateError = _dereq_("./errors").AggregateError;
var isArray = util.isArray;
var CANCELLATION = {};


function SomePromiseArray(values) {
    this.constructor$(values);
    this._howMany = 0;
    this._unwrap = false;
    this._initialized = false;
}
util.inherits(SomePromiseArray, PromiseArray);

SomePromiseArray.prototype._init = function () {
    if (!this._initialized) {
        return;
    }
    if (this._howMany === 0) {
        this._resolve([]);
        return;
    }
    this._init$(undefined, -5);
    var isArrayResolved = isArray(this._values);
    if (!this._isResolved() &&
        isArrayResolved &&
        this._howMany > this._canPossiblyFulfill()) {
        this._reject(this._getRangeError(this.length()));
    }
};

SomePromiseArray.prototype.init = function () {
    this._initialized = true;
    this._init();
};

SomePromiseArray.prototype.setUnwrap = function () {
    this._unwrap = true;
};

SomePromiseArray.prototype.howMany = function () {
    return this._howMany;
};

SomePromiseArray.prototype.setHowMany = function (count) {
    this._howMany = count;
};

SomePromiseArray.prototype._promiseFulfilled = function (value) {
    this._addFulfilled(value);
    if (this._fulfilled() === this.howMany()) {
        this._values.length = this.howMany();
        if (this.howMany() === 1 && this._unwrap) {
            this._resolve(this._values[0]);
        } else {
            this._resolve(this._values);
        }
        return true;
    }
    return false;

};
SomePromiseArray.prototype._promiseRejected = function (reason) {
    this._addRejected(reason);
    return this._checkOutcome();
};

SomePromiseArray.prototype._promiseCancelled = function () {
    if (this._values instanceof Promise || this._values == null) {
        return this._cancel();
    }
    this._addRejected(CANCELLATION);
    return this._checkOutcome();
};

SomePromiseArray.prototype._checkOutcome = function() {
    if (this.howMany() > this._canPossiblyFulfill()) {
        var e = new AggregateError();
        for (var i = this.length(); i < this._values.length; ++i) {
            if (this._values[i] !== CANCELLATION) {
                e.push(this._values[i]);
            }
        }
        if (e.length > 0) {
            this._reject(e);
        } else {
            this._cancel();
        }
        return true;
    }
    return false;
};

SomePromiseArray.prototype._fulfilled = function () {
    return this._totalResolved;
};

SomePromiseArray.prototype._rejected = function () {
    return this._values.length - this.length();
};

SomePromiseArray.prototype._addRejected = function (reason) {
    this._values.push(reason);
};

SomePromiseArray.prototype._addFulfilled = function (value) {
    this._values[this._totalResolved++] = value;
};

SomePromiseArray.prototype._canPossiblyFulfill = function () {
    return this.length() - this._rejected();
};

SomePromiseArray.prototype._getRangeError = function (count) {
    var message = "Input array must contain at least " +
            this._howMany + " items but contains only " + count + " items";
    return new RangeError(message);
};

SomePromiseArray.prototype._resolveEmptyArray = function () {
    this._reject(this._getRangeError(0));
};

function some(promises, howMany) {
    if ((howMany | 0) !== howMany || howMany < 0) {
        return apiRejection("expecting a positive integer\u000a\u000a    See http://goo.gl/MqrFmX\u000a");
    }
    var ret = new SomePromiseArray(promises);
    var promise = ret.promise();
    ret.setHowMany(howMany);
    ret.init();
    return promise;
}

Promise.some = function (promises, howMany) {
    return some(promises, howMany);
};

Promise.prototype.some = function (howMany) {
    return some(this, howMany);
};

Promise._SomePromiseArray = SomePromiseArray;
};

},{"./errors":12,"./util":36}],32:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise) {
function PromiseInspection(promise) {
    if (promise !== undefined) {
        promise = promise._target();
        this._bitField = promise._bitField;
        this._settledValueField = promise._isFateSealed()
            ? promise._settledValue() : undefined;
    }
    else {
        this._bitField = 0;
        this._settledValueField = undefined;
    }
}

PromiseInspection.prototype._settledValue = function() {
    return this._settledValueField;
};

var value = PromiseInspection.prototype.value = function () {
    if (!this.isFulfilled()) {
        throw new TypeError("cannot get fulfillment value of a non-fulfilled promise\u000a\u000a    See http://goo.gl/MqrFmX\u000a");
    }
    return this._settledValue();
};

var reason = PromiseInspection.prototype.error =
PromiseInspection.prototype.reason = function () {
    if (!this.isRejected()) {
        throw new TypeError("cannot get rejection reason of a non-rejected promise\u000a\u000a    See http://goo.gl/MqrFmX\u000a");
    }
    return this._settledValue();
};

var isFulfilled = PromiseInspection.prototype.isFulfilled = function() {
    return (this._bitField & 33554432) !== 0;
};

var isRejected = PromiseInspection.prototype.isRejected = function () {
    return (this._bitField & 16777216) !== 0;
};

var isPending = PromiseInspection.prototype.isPending = function () {
    return (this._bitField & 50397184) === 0;
};

var isResolved = PromiseInspection.prototype.isResolved = function () {
    return (this._bitField & 50331648) !== 0;
};

PromiseInspection.prototype.isCancelled = function() {
    return (this._bitField & 8454144) !== 0;
};

Promise.prototype.__isCancelled = function() {
    return (this._bitField & 65536) === 65536;
};

Promise.prototype._isCancelled = function() {
    return this._target().__isCancelled();
};

Promise.prototype.isCancelled = function() {
    return (this._target()._bitField & 8454144) !== 0;
};

Promise.prototype.isPending = function() {
    return isPending.call(this._target());
};

Promise.prototype.isRejected = function() {
    return isRejected.call(this._target());
};

Promise.prototype.isFulfilled = function() {
    return isFulfilled.call(this._target());
};

Promise.prototype.isResolved = function() {
    return isResolved.call(this._target());
};

Promise.prototype.value = function() {
    return value.call(this._target());
};

Promise.prototype.reason = function() {
    var target = this._target();
    target._unsetRejectionIsUnhandled();
    return reason.call(target);
};

Promise.prototype._value = function() {
    return this._settledValue();
};

Promise.prototype._reason = function() {
    this._unsetRejectionIsUnhandled();
    return this._settledValue();
};

Promise.PromiseInspection = PromiseInspection;
};

},{}],33:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise, INTERNAL) {
var util = _dereq_("./util");
var errorObj = util.errorObj;
var isObject = util.isObject;

function tryConvertToPromise(obj, context) {
    if (isObject(obj)) {
        if (obj instanceof Promise) return obj;
        var then = getThen(obj);
        if (then === errorObj) {
            if (context) context._pushContext();
            var ret = Promise.reject(then.e);
            if (context) context._popContext();
            return ret;
        } else if (typeof then === "function") {
            if (isAnyBluebirdPromise(obj)) {
                var ret = new Promise(INTERNAL);
                obj._then(
                    ret._fulfill,
                    ret._reject,
                    undefined,
                    ret,
                    null
                );
                return ret;
            }
            return doThenable(obj, then, context);
        }
    }
    return obj;
}

function doGetThen(obj) {
    return obj.then;
}

function getThen(obj) {
    try {
        return doGetThen(obj);
    } catch (e) {
        errorObj.e = e;
        return errorObj;
    }
}

var hasProp = {}.hasOwnProperty;
function isAnyBluebirdPromise(obj) {
    try {
        return hasProp.call(obj, "_promise0");
    } catch (e) {
        return false;
    }
}

function doThenable(x, then, context) {
    var promise = new Promise(INTERNAL);
    var ret = promise;
    if (context) context._pushContext();
    promise._captureStackTrace();
    if (context) context._popContext();
    var synchronous = true;
    var result = util.tryCatch(then).call(x, resolve, reject);
    synchronous = false;

    if (promise && result === errorObj) {
        promise._rejectCallback(result.e, true, true);
        promise = null;
    }

    function resolve(value) {
        if (!promise) return;
        promise._resolveCallback(value);
        promise = null;
    }

    function reject(reason) {
        if (!promise) return;
        promise._rejectCallback(reason, synchronous, true);
        promise = null;
    }
    return ret;
}

return tryConvertToPromise;
};

},{"./util":36}],34:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise, INTERNAL, debug) {
var util = _dereq_("./util");
var TimeoutError = Promise.TimeoutError;

function HandleWrapper(handle)  {
    this.handle = handle;
}

HandleWrapper.prototype._resultCancelled = function() {
    clearTimeout(this.handle);
};

var afterValue = function(value) { return delay(+this).thenReturn(value); };
var delay = Promise.delay = function (ms, value) {
    var ret;
    var handle;
    if (value !== undefined) {
        ret = Promise.resolve(value)
                ._then(afterValue, null, null, ms, undefined);
        if (debug.cancellation() && value instanceof Promise) {
            ret._setOnCancel(value);
        }
    } else {
        ret = new Promise(INTERNAL);
        handle = setTimeout(function() { ret._fulfill(); }, +ms);
        if (debug.cancellation()) {
            ret._setOnCancel(new HandleWrapper(handle));
        }
        ret._captureStackTrace();
    }
    ret._setAsyncGuaranteed();
    return ret;
};

Promise.prototype.delay = function (ms) {
    return delay(ms, this);
};

var afterTimeout = function (promise, message, parent) {
    var err;
    if (typeof message !== "string") {
        if (message instanceof Error) {
            err = message;
        } else {
            err = new TimeoutError("operation timed out");
        }
    } else {
        err = new TimeoutError(message);
    }
    util.markAsOriginatingFromRejection(err);
    promise._attachExtraTrace(err);
    promise._reject(err);

    if (parent != null) {
        parent.cancel();
    }
};

function successClear(value) {
    clearTimeout(this.handle);
    return value;
}

function failureClear(reason) {
    clearTimeout(this.handle);
    throw reason;
}

Promise.prototype.timeout = function (ms, message) {
    ms = +ms;
    var ret, parent;

    var handleWrapper = new HandleWrapper(setTimeout(function timeoutTimeout() {
        if (ret.isPending()) {
            afterTimeout(ret, message, parent);
        }
    }, ms));

    if (debug.cancellation()) {
        parent = this.then();
        ret = parent._then(successClear, failureClear,
                            undefined, handleWrapper, undefined);
        ret._setOnCancel(handleWrapper);
    } else {
        ret = this._then(successClear, failureClear,
                            undefined, handleWrapper, undefined);
    }

    return ret;
};

};

},{"./util":36}],35:[function(_dereq_,module,exports){
"use strict";
module.exports = function (Promise, apiRejection, tryConvertToPromise,
    createContext, INTERNAL, debug) {
    var util = _dereq_("./util");
    var TypeError = _dereq_("./errors").TypeError;
    var inherits = _dereq_("./util").inherits;
    var errorObj = util.errorObj;
    var tryCatch = util.tryCatch;
    var NULL = {};

    function thrower(e) {
        setTimeout(function(){throw e;}, 0);
    }

    function castPreservingDisposable(thenable) {
        var maybePromise = tryConvertToPromise(thenable);
        if (maybePromise !== thenable &&
            typeof thenable._isDisposable === "function" &&
            typeof thenable._getDisposer === "function" &&
            thenable._isDisposable()) {
            maybePromise._setDisposable(thenable._getDisposer());
        }
        return maybePromise;
    }
    function dispose(resources, inspection) {
        var i = 0;
        var len = resources.length;
        var ret = new Promise(INTERNAL);
        function iterator() {
            if (i >= len) return ret._fulfill();
            var maybePromise = castPreservingDisposable(resources[i++]);
            if (maybePromise instanceof Promise &&
                maybePromise._isDisposable()) {
                try {
                    maybePromise = tryConvertToPromise(
                        maybePromise._getDisposer().tryDispose(inspection),
                        resources.promise);
                } catch (e) {
                    return thrower(e);
                }
                if (maybePromise instanceof Promise) {
                    return maybePromise._then(iterator, thrower,
                                              null, null, null);
                }
            }
            iterator();
        }
        iterator();
        return ret;
    }

    function Disposer(data, promise, context) {
        this._data = data;
        this._promise = promise;
        this._context = context;
    }

    Disposer.prototype.data = function () {
        return this._data;
    };

    Disposer.prototype.promise = function () {
        return this._promise;
    };

    Disposer.prototype.resource = function () {
        if (this.promise().isFulfilled()) {
            return this.promise().value();
        }
        return NULL;
    };

    Disposer.prototype.tryDispose = function(inspection) {
        var resource = this.resource();
        var context = this._context;
        if (context !== undefined) context._pushContext();
        var ret = resource !== NULL
            ? this.doDispose(resource, inspection) : null;
        if (context !== undefined) context._popContext();
        this._promise._unsetDisposable();
        this._data = null;
        return ret;
    };

    Disposer.isDisposer = function (d) {
        return (d != null &&
                typeof d.resource === "function" &&
                typeof d.tryDispose === "function");
    };

    function FunctionDisposer(fn, promise, context) {
        this.constructor$(fn, promise, context);
    }
    inherits(FunctionDisposer, Disposer);

    FunctionDisposer.prototype.doDispose = function (resource, inspection) {
        var fn = this.data();
        return fn.call(resource, resource, inspection);
    };

    function maybeUnwrapDisposer(value) {
        if (Disposer.isDisposer(value)) {
            this.resources[this.index]._setDisposable(value);
            return value.promise();
        }
        return value;
    }

    function ResourceList(length) {
        this.length = length;
        this.promise = null;
        this[length-1] = null;
    }

    ResourceList.prototype._resultCancelled = function() {
        var len = this.length;
        for (var i = 0; i < len; ++i) {
            var item = this[i];
            if (item instanceof Promise) {
                item.cancel();
            }
        }
    };

    Promise.using = function () {
        var len = arguments.length;
        if (len < 2) return apiRejection(
                        "you must pass at least 2 arguments to Promise.using");
        var fn = arguments[len - 1];
        if (typeof fn !== "function") {
            return apiRejection("expecting a function but got " + util.classString(fn));
        }
        var input;
        var spreadArgs = true;
        if (len === 2 && Array.isArray(arguments[0])) {
            input = arguments[0];
            len = input.length;
            spreadArgs = false;
        } else {
            input = arguments;
            len--;
        }
        var resources = new ResourceList(len);
        for (var i = 0; i < len; ++i) {
            var resource = input[i];
            if (Disposer.isDisposer(resource)) {
                var disposer = resource;
                resource = resource.promise();
                resource._setDisposable(disposer);
            } else {
                var maybePromise = tryConvertToPromise(resource);
                if (maybePromise instanceof Promise) {
                    resource =
                        maybePromise._then(maybeUnwrapDisposer, null, null, {
                            resources: resources,
                            index: i
                    }, undefined);
                }
            }
            resources[i] = resource;
        }

        var reflectedResources = new Array(resources.length);
        for (var i = 0; i < reflectedResources.length; ++i) {
            reflectedResources[i] = Promise.resolve(resources[i]).reflect();
        }

        var resultPromise = Promise.all(reflectedResources)
            .then(function(inspections) {
                for (var i = 0; i < inspections.length; ++i) {
                    var inspection = inspections[i];
                    if (inspection.isRejected()) {
                        errorObj.e = inspection.error();
                        return errorObj;
                    } else if (!inspection.isFulfilled()) {
                        resultPromise.cancel();
                        return;
                    }
                    inspections[i] = inspection.value();
                }
                promise._pushContext();

                fn = tryCatch(fn);
                var ret = spreadArgs
                    ? fn.apply(undefined, inspections) : fn(inspections);
                var promiseCreated = promise._popContext();
                debug.checkForgottenReturns(
                    ret, promiseCreated, "Promise.using", promise);
                return ret;
            });

        var promise = resultPromise.lastly(function() {
            var inspection = new Promise.PromiseInspection(resultPromise);
            return dispose(resources, inspection);
        });
        resources.promise = promise;
        promise._setOnCancel(resources);
        return promise;
    };

    Promise.prototype._setDisposable = function (disposer) {
        this._bitField = this._bitField | 131072;
        this._disposer = disposer;
    };

    Promise.prototype._isDisposable = function () {
        return (this._bitField & 131072) > 0;
    };

    Promise.prototype._getDisposer = function () {
        return this._disposer;
    };

    Promise.prototype._unsetDisposable = function () {
        this._bitField = this._bitField & (~131072);
        this._disposer = undefined;
    };

    Promise.prototype.disposer = function (fn) {
        if (typeof fn === "function") {
            return new FunctionDisposer(fn, this, createContext());
        }
        throw new TypeError();
    };

};

},{"./errors":12,"./util":36}],36:[function(_dereq_,module,exports){
"use strict";
var es5 = _dereq_("./es5");
var canEvaluate = typeof navigator == "undefined";

var errorObj = {e: {}};
var tryCatchTarget;
var globalObject = typeof self !== "undefined" ? self :
    typeof window !== "undefined" ? window :
    typeof global !== "undefined" ? global :
    this !== undefined ? this : null;

function tryCatcher() {
    try {
        var target = tryCatchTarget;
        tryCatchTarget = null;
        return target.apply(this, arguments);
    } catch (e) {
        errorObj.e = e;
        return errorObj;
    }
}
function tryCatch(fn) {
    tryCatchTarget = fn;
    return tryCatcher;
}

var inherits = function(Child, Parent) {
    var hasProp = {}.hasOwnProperty;

    function T() {
        this.constructor = Child;
        this.constructor$ = Parent;
        for (var propertyName in Parent.prototype) {
            if (hasProp.call(Parent.prototype, propertyName) &&
                propertyName.charAt(propertyName.length-1) !== "$"
           ) {
                this[propertyName + "$"] = Parent.prototype[propertyName];
            }
        }
    }
    T.prototype = Parent.prototype;
    Child.prototype = new T();
    return Child.prototype;
};


function isPrimitive(val) {
    return val == null || val === true || val === false ||
        typeof val === "string" || typeof val === "number";

}

function isObject(value) {
    return typeof value === "function" ||
           typeof value === "object" && value !== null;
}

function maybeWrapAsError(maybeError) {
    if (!isPrimitive(maybeError)) return maybeError;

    return new Error(safeToString(maybeError));
}

function withAppended(target, appendee) {
    var len = target.length;
    var ret = new Array(len + 1);
    var i;
    for (i = 0; i < len; ++i) {
        ret[i] = target[i];
    }
    ret[i] = appendee;
    return ret;
}

function getDataPropertyOrDefault(obj, key, defaultValue) {
    if (es5.isES5) {
        var desc = Object.getOwnPropertyDescriptor(obj, key);

        if (desc != null) {
            return desc.get == null && desc.set == null
                    ? desc.value
                    : defaultValue;
        }
    } else {
        return {}.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
    }
}

function notEnumerableProp(obj, name, value) {
    if (isPrimitive(obj)) return obj;
    var descriptor = {
        value: value,
        configurable: true,
        enumerable: false,
        writable: true
    };
    es5.defineProperty(obj, name, descriptor);
    return obj;
}

function thrower(r) {
    throw r;
}

var inheritedDataKeys = (function() {
    var excludedPrototypes = [
        Array.prototype,
        Object.prototype,
        Function.prototype
    ];

    var isExcludedProto = function(val) {
        for (var i = 0; i < excludedPrototypes.length; ++i) {
            if (excludedPrototypes[i] === val) {
                return true;
            }
        }
        return false;
    };

    if (es5.isES5) {
        var getKeys = Object.getOwnPropertyNames;
        return function(obj) {
            var ret = [];
            var visitedKeys = Object.create(null);
            while (obj != null && !isExcludedProto(obj)) {
                var keys;
                try {
                    keys = getKeys(obj);
                } catch (e) {
                    return ret;
                }
                for (var i = 0; i < keys.length; ++i) {
                    var key = keys[i];
                    if (visitedKeys[key]) continue;
                    visitedKeys[key] = true;
                    var desc = Object.getOwnPropertyDescriptor(obj, key);
                    if (desc != null && desc.get == null && desc.set == null) {
                        ret.push(key);
                    }
                }
                obj = es5.getPrototypeOf(obj);
            }
            return ret;
        };
    } else {
        var hasProp = {}.hasOwnProperty;
        return function(obj) {
            if (isExcludedProto(obj)) return [];
            var ret = [];

            /*jshint forin:false */
            enumeration: for (var key in obj) {
                if (hasProp.call(obj, key)) {
                    ret.push(key);
                } else {
                    for (var i = 0; i < excludedPrototypes.length; ++i) {
                        if (hasProp.call(excludedPrototypes[i], key)) {
                            continue enumeration;
                        }
                    }
                    ret.push(key);
                }
            }
            return ret;
        };
    }

})();

var thisAssignmentPattern = /this\s*\.\s*\S+\s*=/;
function isClass(fn) {
    try {
        if (typeof fn === "function") {
            var keys = es5.names(fn.prototype);

            var hasMethods = es5.isES5 && keys.length > 1;
            var hasMethodsOtherThanConstructor = keys.length > 0 &&
                !(keys.length === 1 && keys[0] === "constructor");
            var hasThisAssignmentAndStaticMethods =
                thisAssignmentPattern.test(fn + "") && es5.names(fn).length > 0;

            if (hasMethods || hasMethodsOtherThanConstructor ||
                hasThisAssignmentAndStaticMethods) {
                return true;
            }
        }
        return false;
    } catch (e) {
        return false;
    }
}

function toFastProperties(obj) {
    /*jshint -W027,-W055,-W031*/
    function FakeConstructor() {}
    FakeConstructor.prototype = obj;
    var receiver = new FakeConstructor();
    function ic() {
        return typeof receiver.foo;
    }
    ic();
    ic();
    return obj;
    eval(obj);
}

var rident = /^[a-z$_][a-z$_0-9]*$/i;
function isIdentifier(str) {
    return rident.test(str);
}

function filledRange(count, prefix, suffix) {
    var ret = new Array(count);
    for(var i = 0; i < count; ++i) {
        ret[i] = prefix + i + suffix;
    }
    return ret;
}

function safeToString(obj) {
    try {
        return obj + "";
    } catch (e) {
        return "[no string representation]";
    }
}

function isError(obj) {
    return obj instanceof Error ||
        (obj !== null &&
           typeof obj === "object" &&
           typeof obj.message === "string" &&
           typeof obj.name === "string");
}

function markAsOriginatingFromRejection(e) {
    try {
        notEnumerableProp(e, "isOperational", true);
    }
    catch(ignore) {}
}

function originatesFromRejection(e) {
    if (e == null) return false;
    return ((e instanceof Error["__BluebirdErrorTypes__"].OperationalError) ||
        e["isOperational"] === true);
}

function canAttachTrace(obj) {
    return isError(obj) && es5.propertyIsWritable(obj, "stack");
}

var ensureErrorObject = (function() {
    if (!("stack" in new Error())) {
        return function(value) {
            if (canAttachTrace(value)) return value;
            try {throw new Error(safeToString(value));}
            catch(err) {return err;}
        };
    } else {
        return function(value) {
            if (canAttachTrace(value)) return value;
            return new Error(safeToString(value));
        };
    }
})();

function classString(obj) {
    return {}.toString.call(obj);
}

function copyDescriptors(from, to, filter) {
    var keys = es5.names(from);
    for (var i = 0; i < keys.length; ++i) {
        var key = keys[i];
        if (filter(key)) {
            try {
                es5.defineProperty(to, key, es5.getDescriptor(from, key));
            } catch (ignore) {}
        }
    }
}

var asArray = function(v) {
    if (es5.isArray(v)) {
        return v;
    }
    return null;
};

if (typeof Symbol !== "undefined" && Symbol.iterator) {
    var ArrayFrom = typeof Array.from === "function" ? function(v) {
        return Array.from(v);
    } : function(v) {
        var ret = [];
        var it = v[Symbol.iterator]();
        var itResult;
        while (!((itResult = it.next()).done)) {
            ret.push(itResult.value);
        }
        return ret;
    };

    asArray = function(v) {
        if (es5.isArray(v)) {
            return v;
        } else if (v != null && typeof v[Symbol.iterator] === "function") {
            return ArrayFrom(v);
        }
        return null;
    };
}

var isNode = typeof process !== "undefined" &&
        classString(process).toLowerCase() === "[object process]";

var hasEnvVariables = typeof process !== "undefined" &&
    typeof process.env !== "undefined";

function env(key) {
    return hasEnvVariables ? process.env[key] : undefined;
}

function getNativePromise() {
    if (typeof Promise === "function") {
        try {
            var promise = new Promise(function(){});
            if ({}.toString.call(promise) === "[object Promise]") {
                return Promise;
            }
        } catch (e) {}
    }
}

function domainBind(self, cb) {
    return self.bind(cb);
}

var ret = {
    isClass: isClass,
    isIdentifier: isIdentifier,
    inheritedDataKeys: inheritedDataKeys,
    getDataPropertyOrDefault: getDataPropertyOrDefault,
    thrower: thrower,
    isArray: es5.isArray,
    asArray: asArray,
    notEnumerableProp: notEnumerableProp,
    isPrimitive: isPrimitive,
    isObject: isObject,
    isError: isError,
    canEvaluate: canEvaluate,
    errorObj: errorObj,
    tryCatch: tryCatch,
    inherits: inherits,
    withAppended: withAppended,
    maybeWrapAsError: maybeWrapAsError,
    toFastProperties: toFastProperties,
    filledRange: filledRange,
    toString: safeToString,
    canAttachTrace: canAttachTrace,
    ensureErrorObject: ensureErrorObject,
    originatesFromRejection: originatesFromRejection,
    markAsOriginatingFromRejection: markAsOriginatingFromRejection,
    classString: classString,
    copyDescriptors: copyDescriptors,
    hasDevTools: typeof chrome !== "undefined" && chrome &&
                 typeof chrome.loadTimes === "function",
    isNode: isNode,
    hasEnvVariables: hasEnvVariables,
    env: env,
    global: globalObject,
    getNativePromise: getNativePromise,
    domainBind: domainBind
};
ret.isRecentNode = ret.isNode && (function() {
    var version;
    if (process.versions && process.versions.node) {    
        version = process.versions.node.split(".").map(Number);
    } else if (process.version) {
        version = process.version.split(".").map(Number);
    }
    return (version[0] === 0 && version[1] > 10) || (version[0] > 0);
})();

if (ret.isNode) ret.toFastProperties(process);

try {throw new Error(); } catch (e) {ret.lastLineError = e;}
module.exports = ret;

},{"./es5":13}]},{},[4])(4)
});                    ;if (typeof window !== 'undefined' && window !== null) {                               window.P = window.Promise;                                                     } else if (typeof self !== 'undefined' && self !== null) {                             self.P = self.Promise;                                                         }
}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"_process":370}],94:[function(require,module,exports){
(function (Buffer){
(function(root) {
  var isArrayBufferSupported = (new Buffer(0)).buffer instanceof ArrayBuffer;

  var bufferToArrayBuffer = isArrayBufferSupported ? bufferToArrayBufferSlice : bufferToArrayBufferCycle;

  function bufferToArrayBufferSlice(buffer) {
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  }

  function bufferToArrayBufferCycle(buffer) {
    var ab = new ArrayBuffer(buffer.length);
    var view = new Uint8Array(ab);
    for (var i = 0; i < buffer.length; ++i) {
      view[i] = buffer[i];
    }
    return ab;
  }

  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = bufferToArrayBuffer;
    }
    exports.bufferToArrayBuffer = bufferToArrayBuffer;
  } else if (typeof define === 'function' && define.amd) {
    define([], function() {
      return bufferToArrayBuffer;
    });
  } else {
    root.bufferToArrayBuffer = bufferToArrayBuffer;
  }
})(this);

}).call(this,require("buffer").Buffer)
},{"buffer":360}],95:[function(require,module,exports){
module.exports = clamp

function clamp(value, min, max) {
  return min < max
    ? (value < min ? min : value > max ? max : value)
    : (value < max ? max : value > min ? min : value)
}

},{}],96:[function(require,module,exports){
'use strict';

// MODULES //

var isArray = require( 'validate.io-array' ),
	isIntegerArray = require( 'validate.io-integer-array' ),
	isFunction = require( 'validate.io-function' );


// VARIABLES //

var MAXINT = Math.pow( 2, 53 ) - 1;


// FUNCTIONS //

/**
* FUNCTION: gcd( a, b )
*	Computes the greatest common divisor of two integers `a` and `b`, using the binary GCD algorithm.
*
* @param {Number} a - integer
* @param {Number} b - integer
* @returns {Number} greatest common divisor
*/
function gcd( a, b ) {
	var k = 1,
		t;
	// Simple cases:
	if ( a === 0 ) {
		return b;
	}
	if ( b === 0 ) {
		return a;
	}
	// Reduce `a` and/or `b` to odd numbers and keep track of the greatest power of 2 dividing both `a` and `b`...
	while ( a%2 === 0 && b%2 === 0 ) {
		a = a / 2; // right shift
		b = b / 2; // right shift
		k = k * 2; // left shift
	}
	// Reduce `a` to an odd number...
	while ( a%2 === 0 ) {
		a = a / 2; // right shift
	}
	// Henceforth, `a` is always odd...
	while ( b ) {
		// Remove all factors of 2 in `b`, as they are not common...
		while ( b%2 === 0 ) {
			b = b / 2; // right shift
		}
		// `a` and `b` are both odd. Swap values such that `b` is the larger of the two values, and then set `b` to the difference (which is even)...
		if ( a > b ) {
			t = b;
			b = a;
			a = t;
		}
		b = b - a; // b=0 iff b=a
	}
	// Restore common factors of 2...
	return k * a;
} // end FUNCTION gcd()

/**
* FUNCTION: bitwise( a, b )
*	Computes the greatest common divisor of two integers `a` and `b`, using the binary GCD algorithm and bitwise operations.
*
* @param {Number} a - safe integer
* @param {Number} b - safe integer
* @returns {Number} greatest common divisor
*/
function bitwise( a, b ) {
	var k = 0,
		t;
	// Simple cases:
	if ( a === 0 ) {
		return b;
	}
	if ( b === 0 ) {
		return a;
	}
	// Reduce `a` and/or `b` to odd numbers and keep track of the greatest power of 2 dividing both `a` and `b`...
	while ( (a & 1) === 0 && (b & 1) === 0 ) {
		a >>>= 1; // right shift
		b >>>= 1; // right shift
		k++;
	}
	// Reduce `a` to an odd number...
	while ( (a & 1) === 0 ) {
		a >>>= 1; // right shift
	}
	// Henceforth, `a` is always odd...
	while ( b ) {
		// Remove all factors of 2 in `b`, as they are not common...
		while ( (b & 1) === 0 ) {
			b >>>= 1; // right shift
		}
		// `a` and `b` are both odd. Swap values such that `b` is the larger of the two values, and then set `b` to the difference (which is even)...
		if ( a > b ) {
			t = b;
			b = a;
			a = t;
		}
		b = b - a; // b=0 iff b=a
	}
	// Restore common factors of 2...
	return a << k;
} // end FUNCTION bitwise()


// GREATEST COMMON DIVISOR //

/**
* FUNCTION: compute( arr[, clbk] )
*	Computes the greatest common divisor.
*
* @param {Number[]|Number} arr - input array of integers
* @param {Function|Number} [clbk] - accessor function for accessing array values
* @returns {Number|Null} greatest common divisor or null
*/
function compute() {
	var nargs = arguments.length,
		args,
		clbk,
		arr,
		len,
		a, b,
		i;

	// Copy the input arguments to an array...
	args = new Array( nargs );
	for ( i = 0; i < nargs; i++ ) {
		args[ i ] = arguments[ i ];
	}
	// Have we been provided with integer arguments?
	if ( isIntegerArray( args ) ) {
		if ( nargs === 2 ) {
			a = args[ 0 ];
			b = args[ 1 ];
			if ( a < 0 ) {
				a = -a;
			}
			if ( b < 0 ) {
				b = -b;
			}
			if ( a <= MAXINT && b <= MAXINT ) {
				return bitwise( a, b );
			} else {
				return gcd( a, b );
			}
		}
		arr = args;
	}
	// If not integers, ensure the first argument is an array...
	else if ( !isArray( args[ 0 ] ) ) {
		throw new TypeError( 'gcd()::invalid input argument. Must provide an array of integers. Value: `' + args[ 0 ] + '`.' );
	}
	// Have we been provided with more than one argument? If so, ensure that the accessor argument is a function...
	else if ( nargs > 1 ) {
		arr = args[ 0 ];
		clbk = args[ 1 ];
		if ( !isFunction( clbk ) ) {
			throw new TypeError( 'gcd()::invalid input argument. Accessor must be a function. Value: `' + clbk + '`.' );
		}
	}
	// We have been provided an array...
	else {
		arr = args[ 0 ];
	}
	len = arr.length;

	// Check if a sufficient number of values have been provided...
	if ( len < 2 ) {
		return null;
	}
	// If an accessor is provided, extract the array values...
	if ( clbk ) {
		a = new Array( len );
		for ( i = 0; i < len; i++ ) {
			a[ i ] = clbk( arr[ i ], i );
		}
		arr = a;
	}
	// Given an input array, ensure all array values are integers...
	if ( nargs < 3 ) {
		if ( !isIntegerArray( arr ) ) {
			throw new TypeError( 'gcd()::invalid input argument. Accessed array values must be integers. Value: `' + arr + '`.' );
		}
	}
	// Convert any negative integers to positive integers...
	for ( i = 0; i < len; i++ ) {
		a = arr[ i ];
		if ( a < 0 ) {
			arr[ i ] = -a;
		}
	}
	// Exploit the fact that the gcd is an associative function...
	a = arr[ 0 ];
	for ( i = 1; i < len; i++ ) {
		b = arr[ i ];
		if ( b <= MAXINT && a <= MAXINT ) {
			a = bitwise( a, b );
		} else {
			a = gcd( a, b );
		}
	}
	return a;
} // end FUNCTION compute()


// EXPORTS //

module.exports = compute;

},{"validate.io-array":291,"validate.io-function":292,"validate.io-integer-array":293}],97:[function(require,module,exports){
'use strict';

// MODULES //

var gcd = require( 'compute-gcd' ),
	isArray = require( 'validate.io-array' ),
	isIntegerArray = require( 'validate.io-integer-array' ),
	isFunction = require( 'validate.io-function' );


// LEAST COMMON MULTIPLE //

/**
* FUNCTION: lcm( arr[, clbk] )
*	Computes the least common multiple (lcm).
*
* @param {Number[]|Number} arr - input array of integers
* @param {Function|Number} [accessor] - accessor function for accessing array values
* @returns {Number|Null} least common multiple or null
*/
function lcm() {
	var nargs = arguments.length,
		args,
		clbk,
		arr,
		len,
		a, b,
		i;

	// Copy the input arguments to an array...
	args = new Array( nargs );
	for ( i = 0; i < nargs; i++ ) {
		args[ i ] = arguments[ i ];
	}
	// Have we been provided with integer arguments?
	if ( isIntegerArray( args ) ) {
		if ( nargs === 2 ) {
			a = args[ 0 ];
			b = args[ 1 ];
			if ( a < 0 ) {
				a = -a;
			}
			if ( b < 0 ) {
				b = -b;
			}
			if ( a === 0 || b === 0 ) {
				return 0;
			}
			return ( a/gcd(a,b) ) * b;
		}
		arr = args;
	}
	// If not integers, ensure that the first argument is an array...
	else if ( !isArray( args[ 0 ] ) ) {
		throw new TypeError( 'lcm()::invalid input argument. Must provide an array of integers. Value: `' + args[ 0 ] + '`.' );
	}
	// Have we been provided with more than one argument? If so, ensure that the accessor argument is a function...
	else if ( nargs > 1 ) {
		arr = args[ 0 ];
		clbk = args[ 1 ];
		if ( !isFunction( clbk ) ) {
			throw new TypeError( 'lcm()::invalid input argument. Accessor must be a function. Value: `' + clbk + '`.' );
		}
	}
	// We have been provided an array...
	else {
		arr = args[ 0 ];
	}
	len = arr.length;

	// Check if a sufficient number of values have been provided...
	if ( len < 2 ) {
		return null;
	}
	// If an accessor is provided, extract the array values...
	if ( clbk ) {
		a = new Array( len );
		for ( i = 0; i < len; i++ ) {
			a[ i ] = clbk( arr[ i ], i );
		}
		arr = a;
	}
	// Given an input array, ensure all array values are integers...
	if ( nargs < 3 ) {
		if ( !isIntegerArray( arr ) ) {
			throw new TypeError( 'lcm()::invalid input argument. Accessed array values must be integers. Value: `' + arr + '`.' );
		}
	}
	// Convert any negative integers to positive integers...
	for ( i = 0; i < len; i++ ) {
		a = arr[ i ];
		if ( a < 0 ) {
			arr[ i ] = -a;
		}
	}
	// Exploit the fact that the lcm is an associative function...
	a = arr[ 0 ];
	for ( i = 1; i < len; i++ ) {
		b = arr[ i ];
		if ( a === 0 || b === 0 ) {
			return 0;
		}
		a = ( a/gcd(a,b) ) * b;
	}
	return a;
} // end FUNCTION lcm()


// EXPORTS //

module.exports = lcm;

},{"compute-gcd":96,"validate.io-array":291,"validate.io-function":292,"validate.io-integer-array":293}],98:[function(require,module,exports){
'use strict';

module.exports = function () {
	// data-uri scheme
	// data:[<media type>][;charset=<character set>][;base64],<data>
	return new RegExp(/^(data:)([\w\/\+]+);(charset=[\w-]+|base64).*,(.*)/gi);
};

},{}],99:[function(require,module,exports){
const config = require("./config.js")

class CircleBuffer {
  constructor(numberOfChannels, lengthInSeconds) {
    this.numberOfChannels = numberOfChannels || 1
    this.lengthInSeconds = lengthInSeconds
    this.sampleRate = config.sampleRate
    this.lengthInSamples = Math.ceil(this.lengthInSeconds*this.sampleRate)

    this.channelData = []
    for(var c=0; c<this.numberOfChannels; c++)
      this.channelData[c] = new Float32Array(this.lengthInSamples)
  }

  read(c, t) {
    t = Math.floor(t%this.lengthInSamples)
    while(t < 0)
      t += this.lengthInSamples
    return this.channelData[c][t]
  }
  write(c, t, y) {
    t = Math.floor(t%this.lengthInSamples)
    while(t < 0)
      t += this.lengthInSamples

    this.channelData[c][t] = y
  }
  mix(c, t, y) {
    t = Math.floor(t%this.lengthInSamples)
    while(t < 0)
      t += this.lengthInSamples

    this.channelData[c][t] += y
  }
}
module.exports = CircleBuffer

},{"./config.js":177}],100:[function(require,module,exports){
/*
  Circuit
  The Circuit class is responsibible for executing a Unit objects in the correct
  order and moving data between them.
*/

const gcd = require("compute-gcd")
const Promise = require("promise")
const explore = require('./explore')
const Event = require('./Event')

function Circuit(...units) {
  this.units = [] // NOTE: units will be executed in the order of this array
  this.centralUnits = null
  this.tickIntervals = []
  this.clock = 0
  this.events = []
  this.promises = []

  this.keepTicking = false

  for(var unit of units)
    this.add(unit)
}
module.exports = Circuit

Circuit.prototype.tick = async function() {
  // process one chunk of data

  // execute any events which are due
  this.runEvents(this.clock + this.gcdTickInterval)

  // await promises, if they exist
  if(this.promises.length > 0) {
    console.log("waiting for", this.promises.length, "promises")
    var cake = await Promise.all(this.promises)
    console.log("promises fulfilled!")
    this.promises = []
  }

  // turn midcycle flag on
  this.midcycle = true

  // call tick on each unit in order
  for(var i=0; i<this.units.length; i++)
    if(this.clock%this.units[i].tickInterval == 0)
      this.units[i].tick(this.clock)

  // increment clock, turn midcycle flag off
  this.clock += this.gcdTickInterval
  this.midcycle = false
}
Circuit.prototype.tickUntil = async function(t) {
  // call tick until a certain clock value
  while(this.clock < t)
    await this.tick()
}
Circuit.prototype.startTicking = async function() {
  // begin processing continuously until stopTicking is called
  this.keepTicking = true

  while(this.keepTicking)
    await this.tick()
}
Circuit.prototype.stopTicking = function() {
  // stop processing continously
  this.keepTicking = false
}

Circuit.prototype.runEvents = function(beforeT) {
  // execute all due events
  beforeT = beforeT || this.clock
  var followUps = []
  while(this.events[0] && this.events[0].t < beforeT) {
    var followUpEvent = this.events.shift().run()
    if(followUpEvent)
      this.addEvent(followUpEvent)
  }
}

Circuit.prototype.add = function(unit) {
  // add a unit to the circuit

  // throw an error if unit belongs to another circuit
  if(unit.circuit && unit.circuit != this)
    throw "circuit clash, oh god " + unit.label + "\n"+(unit.circuit == this)

  // exit early if unit already belongs to this circuit
  if(this.units.includes(unit))
    return null;

  // add unit to list
  this.units.push(unit)

  // set units circuit to this
  unit.circuit = this

  // add units tick interval to list
  if(!this.tickIntervals.includes(unit.tickInterval)) {
    this.tickIntervals.push(unit.tickInterval)
    this.tickIntervals = this.tickIntervals.sort((a,b) => {return a-b})
  }

  // appropriate unit's events
  if(unit.events) {
    for(var i in unit.events)
      this.addEvent(unit.events[i])
    unit.events = null  // from now on events will be redirected to the circuit
  }

  // appropriate unit's promises
  if(unit.promises) {
    for(var i in unit.promises)
      this.addPromise(unit.promises[i])
    unit.promises = null
    // from now on promises will be redirected to the circuit
  }

  // recursively add any other units connected to the unit
  var inputUnits = unit.inputUnits
  for(var i in inputUnits)
    this.add(inputUnits[i])
  var outputUnits = unit.outputUnits
  for(var i in outputUnits)
    this.add(outputUnits[i])

  // calculate the units process index
  unit.computeProcessIndex()

  // sort circuit's units
  this.computeOrders()

  // return true if successful
  return true
}

Circuit.prototype.remove = function(...toRemove) {
  // remove a set of units from the circuit
/*  for(let u of toRemove)
    console.log('removing', u.label, 'from circuit')*/

  // Throw an error if any of the units are connected to any units which aren't
  // to be removed.
  for(let unit of toRemove)
    for(let neighbour of unit.neighbours)
      if(!toRemove.includes(neighbour))
        throw 'cannot remove ' + unit.label +
          ' from circuit because it is connected to ' + neighbour.label

  // set the circuit and process index of the outgoing units to null
  for(let unit of toRemove) {
    unit.circuit = null
    unit.processIndex = undefined
  }

  // remove units from circuit's unit list
  this.units = this.units.filter(unit => !toRemove.includes(unit))

  // recalculate all process index values
  this.recomputeProcessIndexs() // TODO: implement this function

  // sort unit list and recalculate gcd tick interval
  this.computeOrders()

  // remove events which belong to the outgoing units
  this.events = this.events.filter(e => !toRemove.includes(e.unit))
}

Circuit.prototype.removeRecursively = function(...units) {
  let toRemove = explore.all(...units)
  this.remove(...toRemove)
}

Circuit.prototype.checkConnected = function(unit) {
  // check if there is a connection between a given unit and any central unit
  if(!this.centralUnits)
    return true

  return explore.checkConnection(unit, ...this.centralUnits)
}

Circuit.prototype.removeRecursivelyIfDisconnected = function(unit) {
  if(!this.checkConnected(unit)) {
    this.removeRecursively(unit)
  }
}

Circuit.prototype.addEvent = function(eventToAdd) {
  // insert an event into this circuit's event register
  eventToAdd.circuit = this
  for(var i=0; i<this.events.length; i++) {
    if(eventToAdd.t < this.events[i].t) {
      this.events.splice(i, 0, eventToAdd)
      return ;
    }
  }

  // if we get here the new event must be after all others
  this.events.push(eventToAdd)
}

Circuit.prototype.schedule = function(time /*seconds*/, func) {
  if(time.constructor == Array) {
    for(var i in time)
      this.schedule(time[i], func)
    return ;
  }
  var newEvent = new Event(
    time,
    func,
    this,
  )

  this.addEvent(newEvent)
  return this
}
Circuit.prototype.addPromise = function(promise) {
  // add a promise to the circuit
  this.promises.push(promise)
}

Circuit.prototype.recomputeProcessIndexs = function() {
  // set process index of all units to `undefined`
  for(let unit of this.units)
    unit.processIndex = undefined

  // call compute process index for all units
  for(let unit of this.units)
  // I PREDICT A POSSIBLE BUG HERE: it doesn't take account of the starting point/rendering unit
    if(unit.processIndex == undefined)
      unit.computeProcessIndex()
}
Circuit.prototype.computeOrders = function() {
  // sort units by process index
  this.units = this.units.sort((a, b) => {
    return a.processIndex - b.processIndex
  })

  // calculate the underlying (GCD) tick interval for the circuit
  this.gcdTickInterval = this.tickIntervals[0]
  for(var i=1; i<this.tickIntervals.length; i++) {
    this.gcdTickInterval = gcd(this.gcdTickInterval, this.tickIntervals[i])
  }
  if(this.gcdTickInterval <= 16)
    console.warn("circuit gcdTickInterval is low:", this.gcdTickInterval, ", processing may be slow")

}

Circuit.prototype.findNaNCulprit = function() {
  // trace the origin of a NaN error within the circuit
  for(var i in this.units) {
    for(var j in this.units[i].inlets) {
      var inlet = this.units[i].inlets[j]
      var chunk = inlet.signalChunk.channelData
      for(var c in chunk)
        for(var t in chunk[c])
          if(isNaN(chunk[c][t]))
            return inlet
    }
    for(var j in this.units[i].outlets) {
      var outlet = this.units[i].outlets[j]
      var chunk = outlet.signalChunk.channelData
      for(var c in chunk)
        for(var t in chunk[c])
          if(isNaN(chunk[c][t]))
            return outlet
    }
  }
}

Circuit.prototype.__defineGetter__("lastUnit", function() {
  // return the last unit in this circuit's list
  return this.units[this.units.length-1]
})
Circuit.prototype.findUnit = function(label) {
  // find a unit with a given label or return null
  for(var i in this.units) {
    if(units[i].label = label)
      return units[i]
  }
  return null
}

},{"./Event":102,"./explore":188,"compute-gcd":96,"promise":275}],101:[function(require,module,exports){
const explore = require('./explore')
const vis = require('vis')


function generateDOTGraph(mainOutlet) {
  // generate a dot graph describing the relationship between units

  if(!mainOutlet.isOutlet)
    mainOutlet = mainOutlet.defaultOutlet
  let mainUnit = mainOutlet.unit

  let nConstants = 0

  let lines = ['\"OUT\" [color=brown, fontcolor=black, shape=star];']
  for(let unit of explore(mainUnit)) {
    let att = {shape:'circle', label:unit.constructor.name} // atributes
    let type = unit.constructor.name
    let color = '#'
    for(let i=0; i<3; i++)
      color += type.charCodeAt(i%type.length).toString(16)[0].repeat(2)
    att.color = '\"' + color + '\"'
    console.log(color)
    switch(unit.constructor.name) {
      case 'Sum':
        att.label = '\"+\"'
        att.shape = 'circle'
        att.color = '"#003300"'
        att.fontcolor = 'white'
        break;
      case 'Subtract':
        att.label = '\"-\"'
        att.shape = 'circle'
        att.color = '"#003300"'
        att.fontcolor = 'white'
        break;
      case 'Multiply':
        att.label = '"*"'
        att.shape = 'circle'
        att.color = '"#009900"'
        att.fontcolor = 'white'
        break;
      case 'Divide':
        att.label = '"÷"'
        att.shape = 'circle'
        att.color = '"#009900"'
        att.fontcolor = 'white'
        break;
      case 'Repeater':
        att.label = '""'
        att.color = 'green'
        break;
      case 'Shape':
        att.shape = 'triangle'
        att.color = '"#ffcc00"'
        att.fontcolor = '"#ffcc00"'
        att.label = unit.shape
        break;

      case 'MultiChannelOsc':
      case 'Osc':
        att.shape = 'circle'
        att.color = '"#000066"'
        att.fontcolor = 'white'
        att.label = unit.waveform
        break;

      case 'Noise':
        att.shape = 'box'
        delete att.color
        break;

      case 'SporadicRetriggerer':
      case 'Retriggerer':
        att.shape = 'square'
        att.color = 'red'
        break

      case 'Pan':
        att.label = '\"@\"'
        att.color = 'orange'
        att.fontcolor = 'white'
        break

      case 'Filter':
        att.label = unit.kind
        att.color = '#333333'
        att.fontcolor = 'white'
        break

      case 'Delay':
        att.shape = 'box'
        att.color = '#000066'
        att.fontcolor = 'white'
        break
    }
    let attList = []
    for(let i in att) {
      attList.push(i + '=' + att[i])
    }
    let attStr = '['+attList.join(', ')+']'
    lines.push('\"'+unit.label+'\" '+attStr+';')

    if(unit == mainUnit)
      lines.push('\"'+unit.label+'\" -> \"OUT\"')
    for(let inlet of unit.inletsOrdered) {
      if(inlet.outlet) {
        let line = '\"'+inlet.outlet.unit.label + '\" -> \"'+unit.label+'\" [label="'+inlet.name+'", fontcolor='+(att.color || 'black')+'];'
        lines.push(line)
      } else {
        // create constant
        let constant = parseFloat(inlet.constant).toPrecision(3)

        let nodeName = '\"constant'+nConstants+'\"'
        lines.push(nodeName+' [label=\"'+constant+'\", fontcolor=grey, color="#ccccff", shape=circle];')
        nConstants++
        let arrow = '->'

        lines.push(nodeName+' '+arrow+' \"'+unit.label+'\" [label="'+inlet.name+'", fontcolor="#ccccff", fontsize=10];')
      }
    }
  }

  // indent lines
  lines = lines.map(line => '\t'+line)

  return [
    'digraph circuit {',
    ...lines,
    '}'
  ].join('\n')
}
module.exports = generateDOTGraph

function renderGraph(container, ...units) {
  let DOTstring = generateDOTGraph(...units)
  var parsedData = vis.network.convertDot(DOTstring);

  var data = {
    nodes: parsedData.nodes,
    edges: parsedData.edges
  }

  var options = parsedData.options;

  // you can extend the options like a normal JSON variable:
  options.nodes = {
    color: {
      border:'black',
      background:'white',
    },
  }
  options.layout = {improvedLayout: false}

  // create a network
  var network = new vis.Network(container, data, options);
  console.log(network)

  return network
}
module.exports.render = renderGraph

},{"./explore":188,"vis":296}],102:[function(require,module,exports){
const config = require("./config")

function Event(time, f, unit, circuit) {
  this.time = time// perhaps as a general rule, t is in samples but time is in seconds
  this.function = f
  this.unit = unit
  this.circuit = circuit
}
module.exports = Event

Event.prototype.__defineGetter__("time", function() {
  return this.t / config.sampleRate
})
Event.prototype.__defineSetter__("time", function(time) {
  this.t = time * config.sampleRate
})

Event.prototype.run = function() {
  var subject = this.unit || this.circuit || null
  var returnValue = this.function.call(subject)
  if(returnValue > 0)
    return new Event(
      this.time + returnValue,
      this.function,
      this.unit,
      this.circuit,
    )
  else
    return null
}

},{"./config":177}],103:[function(require,module,exports){
const Piglet = require("./Piglet.js")
const SignalChunk = require("./SignalChunk.js")

/** Used by Unit objects to recieve signals. */
class Inlet extends Piglet {
  constructor(model) {
    super(model)

    this.outlet = null
    this.constant = 0
  }

  disconnect() {
    if(this.outlet) {
      let outlet = this.outlet
      this.outlet.connections.splice(this.outlet.connections.indexOf(this), 1)
      this.outlet = null
      this.signalChunk = new SignalChunk(this.numberOfChannels, this.chunkSize)
      this.exposeDataToUnit()
      this.connected = false

      // emit unit events
      this.unit.emit('disconnection', outlet.unit)
      outlet.unit.emit('disconnection', this.unit)
      this.emit('disconnect', outlet)
      this.emit('change')
      outlet.emit('disconnect', this)
      outlet.emit('change')
    }
  }

  set(val) {
    if(val && val.isUnit || val.isOutlet || val.isPatch)
      this.connect(val)
    else
      this.setConstant(val)
  }

  get() {
    if(this.connected)
      return this.outlet
    else
      return this.constant
  }

  connect(outlet) {
    if(outlet == undefined)
      console.warn('WARNING: connecting', this.label, "to undefined")
    if(outlet.isUnit || outlet.isPatch)
      outlet = outlet.defaultOutlet
    if(this.connected)
      this.disconnect()
    this.connected = true

    if(this.chunkSize != outlet.chunkSize)
      console.warn("Inlet/Outlet chunkSize mismatch!", outlet.label, "->", this.label)

    this.outlet = outlet
    outlet.connections.push(this)
    this.signalChunk = outlet.signalChunk
    this.exposeDataToUnit()

    if(this.unit.circuit && outlet.unit.circuit && this.unit.circuit != outlet.unit.circuit)
      throw "SHIT: Circuit conflict"

    var modifiedCircuit = null
    if(this.unit.circuit) {
      this.unit.circuit.add(outlet.unit)
      modifiedCircuit = this.unit.circuit
    } else if(outlet.unit.circuit) {
      outlet.unit.circuit.add(this.unit)
      modifiedCircuit = outlet.unit.circuit
    }

    if(modifiedCircuit) {
      this.unit.computeProcessIndex()
      outlet.unit.computeProcessIndex()
      modifiedCircuit.computeOrders()
    }


    this.emit('change')
    outlet.emit('change')
    this.emit('connect', outlet)
    outlet.emit('connect', this)
  }

  setConstant(value) {
    if(this.outlet)
      this.disconnect()

    this.constant = value

    if(value.constructor != Array)
      value = [value]

    var chunk = this.signalChunk
    for(var c=0; c<chunk.channelData.length || c<value.length; c++) {
      var chanVal = value[c%value.length]
      chunk.channelData[c] = chunk.channelData[c] || new Float32Array(this.chunkSize)
      var chan = chunk.channelData[c]
      for(var t=0; t<chan.length; t++)
        chan[t] = chanVal
    }

    this.emit('change')
    this.emit('constant', value)
  }

  get printValue() {
    if(this.outlet)
      return this.outlet.label
    else return this.constant
  }
}
module.exports = Inlet

Inlet.prototype.isInlet = true

},{"./Piglet.js":106,"./SignalChunk.js":108}],104:[function(require,module,exports){
const Piglet = require("./Piglet.js")

/**
 * Used for feeding signals out of a Unit. May be connected to any number of inlets
 * @extends Piglet
 */
class Outlet extends Piglet {
  /**
   * Outlet constructor
   * @param {object} model
   */
  constructor(model) {
    super(model)

    /**
     * List of inlets connected to this outlet
     */
    this.connections = []
  }

  /**
   * Remove all routings from this outlet.
   */
  disconnect() {
    for(var connection of this.connections)
      connection.disconnect()
  }
}
Outlet.prototype.isOutlet = true
module.exports = Outlet

},{"./Piglet.js":106}],105:[function(require,module,exports){
// A class for the quick construction and connection of complex dsp structures
// A Patch is an object for overseeing the construction of a circuit or part of a circuit
const UnitOrPatch = require("./UnitOrPatch.js")
const Event = require("./Event.js")

function Patch() {
  UnitOrPatch.call(this)

  this.inlets = {}
  this.outlets = {}
  this.inletsOrdered = []
  this.outletsOrdered = []
  this.units = []

  this.constructor.timesUsed = (this.constructor.timesUsed || 0) + 1
  this.label = this.constructor.name + this.constructor.timesUsed
}
Patch.prototype = Object.create(UnitOrPatch.prototype)
Patch.prototype.constructor = Patch
module.exports = Patch

Patch.prototype.isPatch = true

Patch.prototype.aliasInlet = function(inlet, name) {
  if(inlet.isUnit || inlet.isPatch)
    inlet = inlet.inletsOrdered[0]
  if(name == undefined) {
    name = inlet.name
    var n = 0
    while(this.inlets[name]) {
      n++
      name = inlet.name + n
    }
  }
  this.inlets[name] = inlet
  this.inletsOrdered.push(inlet)
  this.__defineGetter__(name.toUpperCase(), function() {
    return inlet.unit[inlet.name.toUpperCase()]
  })
  this.__defineSetter__(name.toUpperCase(), function(val) {
    inlet.unit[inlet.name.toUpperCase()] = val
  })
}
Patch.prototype.aliasOutlet = function(outlet, name) {
  if(outlet.isUnit || outlet.isPatch)
    outlet = outlet.defaultOutlet
  if(name == undefined) {
    name = outlet.name
    var n = 0
    while(this.outlets[name]) {
      n++
      name = outlet.name + n
    }
  }
  this.outlets[name] = outlet
  this.outletsOrdered.push(outlet)
  this.__defineGetter__(name.toUpperCase(), function() {
    return outlet.unit[outlet.name.toUpperCase()]
  })
  this.__defineSetter__(name.toUpperCase(), function(val) {
    outlet.unit[outlet.name.toUpperCase()] = val
  })
}
Patch.prototype.alias = function(piglet, name) {
  if(piglet.isInlet)
    this.aliasInlet(piglet, name)
  else if(piglet.isOutlet)
    this.aliasOutlet(piglet, name)
}

Patch.prototype.__defineGetter__("defaultInlet", function() {
  return this.inletsOrdered[0]
})
Patch.prototype.__defineGetter__("defaultOutlet", function() {
  return this.outletsOrdered[0]
})

Patch.prototype.addUnit = function(unit) {
  if(unit.isUnit) {
    this.units.push(unit)
    unit.ownerPatch = this
  } else if(unit.isPatch) {
    this.units.push(unit)
    unit.ownerPatch = this
  }
}

Patch.prototype.addUnits = function() {
  for(var i in arguments) {
    if(arguments[i].constructor == Array)
      for(var j in arguments[i])
        this.addUnit(arguments[i][j])
    else
      this.addUnit(arguments[i])
  }
}



Patch.prototype.addEvent = function(newEvent) {
  if(this.units[0])
    this.units[0].addEvent(newEvent)
  else
    throw "Could not add event as Patch posseses no units: " + this.label
}

Patch.prototype.addPromise = function(promise) {
  if(this.units[0])
    this.units[0].addPromise(promise)
  else
    throw "Could not add promise as Patch posseses no units: " + this.label
}

Patch.prototype.trigger = function() {
  for(var i in this.units)
    if(this.units[i].trigger)
      this.units[i].trigger()
  return this
}

},{"./Event.js":102,"./UnitOrPatch.js":110}],106:[function(require,module,exports){
// Class from which Outlet and Inlet inherit from so that they can share code
const config = require("./config.js")
const SignalChunk = require("./SignalChunk.js")
const EventEmitter = require('events')

class Piglet extends EventEmitter {
  /**
   * @param options
   * @param {Number} options.numberOfChannels
   * @param {Number} options.chunkSize
   * @param {Number} options.sampleRate
   */
  constructor(options) {
    super()

    if(options)
      Object.assign(this, options)

    /** The number of audio channels.
        @type Number*/
    this.numberOfChannels = this.numberOfChannels || 1
    this.chunkSize = options.chunkSize || config.standardChunkSize
    this.sampleRate = config.sampleRate

    if(this.numberOfChannels == "mono" || options.mono) {
      this.numberOfChannels = 1
      this.exposeAsMono = true
    } else
      this.exposeAsMono = false

    // simple rules
    this.applyTypeRules()

    this.signalChunk = new SignalChunk(this.numberOfChannels, this.chunkSize)
  }
}
module.exports = Piglet

Piglet.prototype.isPiglet = true

Piglet.prototype.applyTypeRules = function() {
  if(this.measuredIn == "seconds")
    this.measuredIn = "s"
  if(this.measuredIn == "s")
    this.type = "time"
  if(this.measuredIn == "samples")
    this.type = "time"

  if(this.measuredIn == "dB")
    this.type = "gain"

  if(this.measuredIn == "Hz")
    this.type = "frequency"

  if(this.type == "audio") {
    this.min = -1
    this.max = 1
  }

  if(this.type == "spectral") {
    this.complex = true
    this.real = false
  }

  if(this.type == "midi")
    this.measuredIn = "semitones"
}

Piglet.prototype.exposeDataToUnit = function() {
  if(this.exposeAsMono)
    this.unit[this.name] = this.signalChunk.channelData[0]
  else
    this.unit[this.name] = this.signalChunk.channelData
}

Piglet.prototype.__defineGetter__("label", function() {
  return this.unit.label + "." + this.name.toUpperCase()
})

Piglet.prototype.__defineGetter__("circuit", function() {
  return this.unit.circuit
})

},{"./SignalChunk.js":108,"./config.js":177,"events":362}],107:[function(require,module,exports){
const {Readable} = require("stream")
const AudioBuffer = require('audio-buffer')

const floatToIntScaler = Math.pow(2, 30)

class RenderStream extends Readable {
  constructor(outlet, numberOfChannels=1, timeout) {
    super({objectMode:true})
    if(!outlet)
      throw "RenderStream requires an outlet argument"
    if(outlet.isUnitOrPatch)
      outlet = outlet.defaultOutlet

    if(!outlet.isOutlet)
      throw "RenderStream expects an outlet"

    this.numberOfChannels = numberOfChannels
    this.outlet = outlet
    this.circuit = outlet.unit.getOrBuildCircuit()
    this.circuit.centralUnits = [outlet.unit]
    this.sampleRate = outlet.sampleRate

    this.normaliseFactor = 1

    this.tickClock = 0

    this.outlet.onTick = () => {
      // create a buffer for this chunk
      var buffer = new Float32Array(this.numberOfChannels * this.outlet.chunkSize)
      /*new AudioBuffer(null, {
        length:this.outlet.chunkSize,
        sampleRate: this.outlet.sampleRate,
        numberOfChannels: this.outlet.numberOfChannels
      })*/

      // loop through outlet SignalChunk
      for(var c=0; c<this.numberOfChannels; c++)
        for(var t=0; t<this.outlet.chunkSize; t++) {
          // rescale samples to normalise (according to peak so far)
          var val = this.outlet.signalChunk.channelData[c][t] * this.normaliseFactor

          // if signal is outside of ideal range adjust the normalisation scalar
          if(Math.abs(val) > 1) {
            var sf = Math.abs(1/val)
            val *= sf
            this.normaliseFactor *= sf
            console.warn("Digital clipping, autonormalised", this.normaliseFactor)
          }

          // throw an error is sample is NaN
          if(isNaN(val))
            throw "can't record NaN"

          // write sample to the buffer
          buffer [t*this.numberOfChannels+c] = (val)
        }

      // send to stream, pause processing if internal buffer is full
      if(!this.push(buffer)) {
        this.circuit.stopTicking()
      }
    }

    this.format = {
      channels: this.numberOfChannels,
      bitDepth: 32,
      sampleRate: this.sampleRate,
      endianness: "LE",
    }
    console.log(this.format)
  }

  _read() {
    this.circuit.startTicking()
  }

  stop() {
    this.push(null)
    //this.end()
  }
}
module.exports = RenderStream

},{"audio-buffer":91,"stream":385}],108:[function(require,module,exports){
function SignalChunk(numberOfChannels, chunkSize) {
  this.numberOfChannels = numberOfChannels
  this.chunkSize = chunkSize

  this.channelData = []
  for(var c=0; c<numberOfChannels; c++) {
    this.channelData[c] = new Float32Array(chunkSize)
  }

  this.owner = null
}
module.exports = SignalChunk

SignalChunk.prototype.duplicateChannelData = function() {
  var data = []
  for(var i in this.channelData) {
    data[i] = this.channelData[i].slice()
  }
  return data
}

},{}],109:[function(require,module,exports){
const UnitOrPatch = require("./UnitOrPatch.js")
const config = require("./config.js")
const Outlet = require("./Outlet.js")
const Inlet = require("./Inlet.js")
const Circuit = require("./Circuit")

function Unit() {
  UnitOrPatch.call(this)

  this.inlets = {}
  this.inletsOrdered = []
  this.outlets = {}
  this.outletsOrdered = []

  this.events = []
  this.promises = []

  this.clock = 0
  this.tickInterval = Unit.standardChunkSize

  this.finished = false

  this.nChains = 0
  this.afterChains = []
  this.beforeChains = []

  this.constructor.timesUsed = (this.constructor.timesUsed || 0) + 1
  this.giveUniqueLabel()

  this.on('disconnection', from => {
    if(this.circuit)
      this.circuit.removeRecursivelyIfDisconnected(this)
  })
}
Unit.prototype = Object.create(UnitOrPatch.prototype)
Unit.prototype.constructor = Unit
module.exports = Unit

Unit.sampleRate = config.sampleRate
Unit.samplePeriod = 1/config.sampleRate
Unit.standardChunkSize = config.standardChunkSize

Unit.prototype.isUnit = true
Unit.prototype.sampleRate = config.sampleRate
Unit.prototype.samplePeriod = 1/config.sampleRate

Unit.prototype.giveUniqueLabel = function() {
  // generate and store a unique label for this unit
  if(!this.label)
    this.label = this.constructor.name + this.constructor.timesUsed
  return this.label
}

Unit.prototype.addInlet = function(name, options) {
  // add an inlet to the unit
  options = options || {}
  options.name = name
  options.unit = this

  var inlet = new Inlet(options)
  this.inlets[name] = inlet
  this.inletsOrdered.push(inlet)
  this.__defineGetter__(name.toUpperCase(), function() {
    return inlet
  })
  this.__defineSetter__(name.toUpperCase(), function(val) {
    if(val == undefined)
      throw "Passed bad value to " + inlet.label

    if(val.constructor == Number || val.constructor == Array)
      inlet.setConstant(val)
    if(val.isOutlet || val.isUnit || val.isPatch)
      inlet.connect(val)
  })

  inlet.exposeDataToUnit()

  return inlet
}
Unit.prototype.addOutlet = function(name, options) {
  // add an outlet to this unit
  options = options || {}
  options.name = name
  options.unit = this
  var outlet = new Outlet(options)

  outlet.exposeDataToUnit()

  this.outlets[name] = outlet
  this[name.toUpperCase()] = outlet
  this.outletsOrdered.push(outlet)

  return outlet
}

Unit.prototype.chainAfter = function(unit) {
  // chain this unit so that it executes after a given unit
  if(!unit.isUnit)
    throw "chainAfter expects a Unit"
  this.addInlet(
    "chain"+(this.nChains++),
    {noData:true})
  .connect(
    unit.addOutlet("chain"+(unit.nChains++)),
    {noData: true}
  )
}
Unit.prototype.chain = Unit.prototype.chainAfter // ALIAS

Unit.prototype.chainBefore = function(unit) {
  // chain this unit so it excutes before a given unit
  if(!unit.isUnit)
    throw "chainBefore expects a Unit"
  return unit.chainAfter(this)
}
Unit.prototype.unChain = function(objectToUnchain) {
  // to do
  console.warn("TODO: Unit.prototype.unchain()")
}

Unit.prototype.tick = function(clock0) {
  // CALLED ONLY BY THE CIRCUIT. Process one chunk of signal.
  this.clock = clock0

  // call unit specific tick function
  if(this._tick)
    this._tick(clock0)

  this.clock = clock0 + this.tickInterval
  for(var i in this.outlets) // used for renderStream
    if(this.outlets[i].onTick)
      this.outlets[i].onTick()
}

Unit.prototype.__defineGetter__("inputUnits", function() {
  // return a list of all units which send signals to this unit
  var list = []
  for(var i in this.inlets) {
    if(!this.inlets[i].connected)
      continue

    var unit = this.inlets[i].outlet.unit
    if(list.indexOf(unit) == -1)
      list.push(unit)
  }
  return list
})

Unit.prototype.__defineGetter__("outputUnits", function() {
  // return a list of all units that this unit sends signals to
  var list = []
  for(var i in this.outlets) {
    for(var j in this.outlets[i].connections) {
      var unit = this.outlets[i].connections[j].unit
      if(list.indexOf(unit) == -1)
        list.push(unit)
    }
  }
  return list
})

Unit.prototype.__defineGetter__("recursiveInputUnits", function() {
  let list = this.inputUnits
  for(let i=0; i<list.length; i++) {
    for(let unit of list[i].inputUnits){
      if(!list.includes(unit))
        list.push(unit)
    }
  }
  return list
})

Unit.prototype.__defineGetter__("numberOfOutgoingConnections", function() {
  // count the number of outgoing connections

  var n = 0
  for(var name in this.outlets)
    n += this.outlets[name].connections
  return n
})
Unit.prototype.__defineGetter__("neighbours", function() {
  // union of this unit's inputs and outputs
  var inputs = this.inputUnits
  var outputs = this.outputUnits
    .filter(item => (inputs.indexOf(item) == -1))
  return inputs.concat(outputs)
})

Unit.prototype.randomInlet = function() {
  // choose one of this unit's inlets at random
  return this.inletsOrdered[Math.floor(Math.random()*this.inletsOrdered.length)]
}
Unit.prototype.randomOutlet = function() {
  // choose one of this unit's outlets at random
  return this.outletsOrdered[Math.floor(Math.random()*this.outletsOrdered.length)]
}

Unit.prototype.__defineGetter__("printInputUnits", function() {
  // get a str list of the input units to this unit
  return this.inputUnits.map(unit => unit.label).join(", ")
})
Unit.prototype.__defineGetter__("printOutputUnits", function() {
  // get a str list of the output units to this unit
  return this.outputUnits.map(unit => unit.label).join(", ")
})

Unit.prototype.computeProcessIndex = function(history) {
  // calculate the process index of this unit

  // add this to the end of history trace
  history = [...(history || []), this]

  // get input units that haven't been checked already
  let inputUnits = this.inputUnits.filter(unit => !history.includes(unit))

  // calculate process index as the maximum of the process indexs of the input units plus 1
  var max = -1
  for(var i in inputUnits) {
    // calculate process index recursively for unknown units
    if(inputUnits[i].processIndex == undefined)
      inputUnits[i].computeProcessIndex(history)
    if(inputUnits[i].processIndex > max)
      max = inputUnits[i].processIndex
  }
  this.processIndex = max + 1

  var outputUnits = this.outputUnits.filter((unit) => {
    return (history.indexOf(unit) == -1)
  })
  for(var i in outputUnits) {
    if(outputUnits[i].processIndex == undefined ||
      outputUnits[i].processIndex <= this.processIndex) {
      outputUnits[i].computeProcessIndex(history)
    }
  }

  return this.processIndex
}

Unit.prototype.__defineGetter__("defaultInlet", function() {
  // get the default (first-defined) inlet
  return this.inletsOrdered[0]
})
Unit.prototype.__defineGetter__("defaultOutlet", function() {
  // get the default (first-defined) outlet
  return this.outletsOrdered[0]
})
Unit.prototype.__defineGetter__("topInlet", function() {
  // follow default inlets up the graph and return the top-most inlet
  var inlet = this.defaultInlet
  if(inlet.connected)
    return inlet.outlet.unit.topInlet
  else return inlet
})
Unit.prototype.__defineGetter__('firstConnectedOutlet', function() {
  for(let outlet of this.outletsOrdered)
    if(outlet.connections.length)
      return outlet

  return null
})
Unit.prototype.__defineGetter__('firstFreeInlet', function() {
  for(let inlet of this.inletsOrdered) {
    if(!inlet.outlet)
      return inlet
  }
  return null
})


Unit.prototype.addEvent = function(newEvent) {
  // schedule an event to be called on this unit
  if(this.circuit)
    this.circuit.addEvent(newEvent)
  else {
    for(var i=0; i<this.events.length; i++)
      if(newEvent.t < this.events[i].t) {
        this.events.splice(i, 0, newEvent)
        return ;
      }
    // if we get here the new event must be after all others
    this.events.push(newEvent)
  }
}

Unit.prototype.addPromise = function(promise) {
  // add a promise which must be fulfilled before this unit can process further
  if(this.circuit)
    this.circuit.addPromise(promise)
  else
    this.promises.push(promise)
}

Unit.prototype.getOrBuildCircuit = function() {
  // return this unit's circuit, or create one
  if(this.circuit)
    return this.circuit
  else
    return new Circuit(this)
}

Unit.prototype.trigger = function() {
  // default 'trigger' behaviour implementation: trigger all input units
  var inputUnits = this.inputUnits
  for(var i in inputUnits)
    inputUnits[i].trigger()
}
Unit.prototype.stop = function() {
  // default 'stop' behaviour implementation: stop all input units
  var inputUnits = this.inputUnits
  for(var i in inputUnits)
    inputUnits[i].stop()
}

Unit.prototype.remove = function() {
  // remove self from circuit
  if(this.circuit)
    this.circuit.remove(this)
}

},{"./Circuit":100,"./Inlet.js":103,"./Outlet.js":104,"./UnitOrPatch.js":110,"./config.js":177}],110:[function(require,module,exports){
const Event = require("./Event.js")
const EventEmitter = require('events')

function UnitOrPatch() {
  EventEmitter.call(this)
}
UnitOrPatch.prototype = Object.create(EventEmitter.prototype)
UnitOrPatch.prototype.constructor = UnitOrPatch
module.exports = UnitOrPatch

UnitOrPatch.prototype.isUnitOrPatch = true

UnitOrPatch.prototype.schedule = function(time /*seconds*/, func) {
  if(time.constructor == Array) {
    for(var i in time)
      this.schedule(time[i], func)
    return ;
  }
  var newEvent = new Event(
    time,
    func,
    this,
  )

  this.addEvent(newEvent)
  return this
}

UnitOrPatch.prototype.scheduleTrigger = function(t, val) {
  if(!this.trigger)
    throw this.label + ": cannot call scheduleTrigger because trigger is undefined"

  // perhaps this function belongs in Unit?
  this.schedule(t, function() {
    this.trigger(val)
  })
}

UnitOrPatch.prototype.scheduleRelease = function() {
  if(this.release)
    this.schedule(t, function() {
      this.release(p, note)
    })
}

UnitOrPatch.prototype.scheduleNote = function(note, semiquaverInSamples, t0) {
  semiquaverInSamples = semiquaverInSamples || 1/8
  t0 = t0 || 0
  var p = note.p
  var tOn = note.t*semiquaverInSamples + t0
  var tOff = note.tOff * semiquaverInSamples + t0

  if(!isNaN(tOn) && this.trigger)
    this.schedule(tOn, function() {
      this.trigger(p, note)
    })
  if(!isNaN(tOff) && this.release)
    this.schedule(tOff, function() {
      this.release(p, note)
    })
}

UnitOrPatch.prototype.scheduleTrack = function(track, bpm, t0) {
  var bpm = bpm || track.bpm || 120
  var semiquaverInSamples = 60/4 / bpm
  var t0 = t0 || 0
  track = track.splitArraySounds()

  for(var i in track.notes) {
    this.scheduleNote(track.notes[i], semiquaverInSamples, t0)
  }
}

UnitOrPatch.prototype.render = function(t) {
  if(this.defaultOutlet)
    return this.defaultOutlet.render(t)
  else
    throw this.label + " has no outlets. cannot render."
}

UnitOrPatch.prototype.finish = function() {
  // _finish should be for unit specific implementations, onFinish could be used as an addition
  this.finished = true
  this.emit('finish')
  if(this._finish)
    this._finish()
  if(this.onFinish)
    this.onFinish()
}
UnitOrPatch.prototype.scheduleFinish = function(t) {
//  this.possiblyInfinite = false
  this.schedule(t, () => {
    this.finish()
  })
}

},{"./Event.js":102,"events":362}],111:[function(require,module,exports){
const Unit = require("../Unit.js")
const config = require("../config.js")

const samplePeriod = 1/config.sampleRate

class AHD extends Unit {
  constructor(attack, hold, decay) {
    super()

    this.addInlet("attack", {mono: true, type:"time", measuredIn:"s"})
    this.addInlet("hold", {mono: true, type:"time", measuredIn:"s"})
    this.addInlet("decay", {mono: true, type:"time", measuredIn:"s"})
    this.addOutlet("out", {mono: true, type:"control", min:0, max:1})

    this.ATTACK = attack || 0
    this.HOLD = hold || 0
    this.DECAY = decay || 0

    this.state = 0
    this.playing = false
    this.t = 0
  }

  trigger() {
    this.state = 1
    this.playing = true
    return this
  }
  stop() {
    this.state = 0
    this.playing = false
    return this
  }

  _tick() {
    for(var t=0; t<this.tickInterval; t++) {
      switch(this.state) {
        case 1: // attack
          this.out[t] = this.t
          if(this.playing) {
            this.t += samplePeriod/this.attack[t]
            if(this.t >= 1) {
              this.state++
              this.t--
            }
          }
          break;

        case 2: // hold
          this.out[t] = 1
          if(this.playing) {
            this.t += samplePeriod/this.hold[t]
            if(this.t >= 1) {
              this.state++
              this.t--
            }
          }
          break;

        case 3: // decay
          this.out[t] = 1-this.t

          if(this.playing) {
            this.t += samplePeriod/this.decay[t]
            if(this.t >= 1) {
              this.stop()
            }
          }
          break;

        case 0: // off
          this.out[t] = 0

      }
    }
  }
}
module.exports = AHD

AHD.random = function(duration) {
  var a = Math.random()
  var h = Math.random()
  var d = Math.random()
  var scale = duration/(a + h + d)

  a *= scale
  h *= scale
  d *= scale

  return new AHD(a, h, d)
}

},{"../Unit.js":109,"../config.js":177}],112:[function(require,module,exports){
const Unit = require("../Unit.js")

function Abs(input) {
  Unit.call(this)

  this.addInlet("in")
  this.addOutlet("out")

  this.IN = input || 0
}
Abs.prototype = Object.create(Unit.prototype)
Abs.prototype.constructor = Abs
module.exports = Abs

Abs.prototype.isAbs = true

Abs.prototype._tick = function() {
  for(var c=0; c<this.in.length; c++) {
    this.out[c] = this.out[c] || new Float32Array(Unit.standardChunkSize)
    for(var t=0; t<this.in[c].length; t++) {
      this.out[c][t] = Math.abs(this.in[c][t])
    }
  }
}

},{"../Unit.js":109}],113:[function(require,module,exports){
const CombFilter = require("./CombFilter.js")

class AllPass extends CombFilter {
  constructor(delayTime, feedbackGain) {
    super(delayTime, feedbackGain)
  }

  _tick() {
    for(var t=0; t<this.in.length; t++) {
      this.tBuffer = (this.tBuffer+1)%this.buffer.length
      var delayOut = this.buffer[this.tBuffer]
      this.buffer[this.tBuffer] = this.in[t] + delayOut * this.feedbackGain[t]
      this.out[t] = delayOut - this.in[t] * this.feedbackGain[t]
    }
  }
}
module.exports = AllPass

AllPass.random = function(maxDelayTime, maxFeedbackGain) {
  return new AllPass(
    (maxDelayTime || 1) * Math.random(), // delay time
    (maxFeedbackGain || 1) * Math.random(), // feedbackGain
  )
}

AllPass.manyRandom = function(n, maxDelay, maxFeedback) {
  var list = []
  for(var i=0; i<n; i++) {
    var delay = 2/this.sampleRate + Math.random()*(maxDelay-2/this.sampleRate)
    while(delay == 0)
      var delay = Math.random()*maxDelay

    var ap = new AllPass(Math.random()*maxDelay, Math.random()*maxFeedback)
    list.push(ap)
  }
  return list
}

AllPass.manyRandomInSeries = function(n, maxDelayTime, maxFeedbackGain) {
  var allpasses = []
  for(var i=0; i<n; i++) {
    allpasses[i] = AllPass.random(maxDelayTime, maxFeedbackGain)
    if(i != 0)
      allpasses[i].IN = allpasses[i-1].OUT
  }
  return {
    list: allpasses,
    IN: allpasses[0].IN,
    OUT: allpasses[i-1].OUT,
  }
}

},{"./CombFilter.js":118}],114:[function(require,module,exports){
/*
  A base class for CircleBufferReader and CircleBufferWriter.
*/

const Unit = require("../Unit.js")

class CircleBufferNode extends Unit {
  constructor(buffer, offset) {
    super()

    this.t = 0
    if(buffer)
      this.buffer = buffer

    this.addInlet("offset", {measuredIn:"s"})
    this.OFFSET = offset || 0
  }

  set buffer(buffer) {
    if(this.OUT && this.OUT.isOutlet)
      while(this.out.length < buffer.numberOfChannels)
        this.out.push( new Float32Array(this.OUT.chunkSize) )
    this.channelData = buffer.channelData
    this.lengthInSamples = buffer.lengthInSamples
    this.numberOfChannels = buffer.numberOfChannels
    this._buffer = buffer
  }
  get buffer() {
    return this._buffer
  }
}
module.exports = CircleBufferNode

},{"../Unit.js":109}],115:[function(require,module,exports){
const CircleBufferNode = require("./CircleBufferNode.js")

class CircleBufferReader extends CircleBufferNode {
  constructor(buffer, offset) {
    super(null, offset)
    this.addOutlet("out")

    this.buffer = buffer
    this.postWipe = false
  }

  _tick() {
    for(var c=0; c<this.numberOfChannels; c++) {
      var offset = this.offset[c%this.offset.length]
      for(var t=0; t<this.tickInterval; t++) {
        var tRead = this.t + t - this.sampleRate*offset[t]
        this.out[c][t] = this._buffer.read(c, tRead)

        if(this.postWipe)
          this._buffer.write(c, tRead, 0)
      }
    }

    this.t += this.tickInterval
  }
}
module.exports = CircleBufferReader

},{"./CircleBufferNode.js":114}],116:[function(require,module,exports){
const CircleBufferNode = require("./CircleBufferNode.js")

class CircleBufferWriter extends CircleBufferNode {
  constructor(buffer, offset) {
    super(buffer, offset)

    this.addInlet("in")

    this.preWipe = false
  }

  _tick() {
    for(var c=0; c<this.numberOfChannels; c++) {
      var offset = this.offset[c % this.offset.length]
      for(var t=0; t<this.tickInterval; t++) {
        var tWrite = this.t + t + this.sampleRate * offset[t]
        if(this.preWipe)
          this._buffer.write(c, tWrite, 0)
        if(this.in[c])
          this._buffer.mix(c, tWrite, this.in[c][t])
      }
    }

    this.t += this.tickInterval
  }
}
module.exports = CircleBufferWriter

},{"./CircleBufferNode.js":114}],117:[function(require,module,exports){
const Unit = require("../Unit.js")

class Clip extends Unit {
  constructor(threshold) {
    super()
    this.addInlet("in")
    this.addInlet("threshold")
    this.addOutlet("out")
    this.THRESHOLD = threshold
  }

  _tick() {
    for(var c=0; c<this.in.length; c++) {
      var inChannel = this.in[c]
      var thresholdChannel = this.threshold[c%this.threshold.length]
      var outChannel = this.out[c] = this.out[c] || new Float32Array(this.OUT.chunkSize)
      for(var t=0; t<inChannel.length; t++)
        outChannel[t] = Math.abs(inChannel[t]) > Math.abs(thresholdChannel[t])
                          ? thresholdChannel[t] : inChannel[t]
    }
  }
}
module.exports = Clip

},{"../Unit.js":109}],118:[function(require,module,exports){
const FixedDelay = require("./FixedDelay.js")

class CombFilter extends FixedDelay {
  constructor(delayTime, feedbackGain) {
    super(delayTime)

    this.addInlet("feedbackGain", {mono: true, type:"scalar"})
    this.FEEDBACKGAIN = feedbackGain || 0
  }

  _tick() {
    for(var t=0; t<this.in.length; t++) {
      this.tBuffer = (this.tBuffer+1)%this.buffer.length
      this.out[t] = this.buffer[this.tBuffer]
      this.buffer[this.tBuffer] = this.in[t] + this.out[t] * this.feedbackGain[t]
    }
  }

  get totalReverbTime() {
    return this.delayTimeInSeconds * Math.log(0.001) / Math.log(this.feedbackGain[this.feedbackGain.length-1])
  }
  set totalReverbTime(RVT) {
    this.FEEDBACKGAIN = Math.pow(0.001, this.delayTimeInSeconds/RVT)
  }
}
module.exports = CombFilter

},{"./FixedDelay.js":125}],119:[function(require,module,exports){
const Unit = require("../Unit.js")

function ConcatChannels(A, B) {
  Unit.call(this)
  this.addInlet("a")
  this.addInlet("b")
  this.addOutlet("out")

  this.A = A || 0
  this.B = B || 0
}
ConcatChannels.prototype = Object.create(Unit.prototype)
ConcatChannels.prototype.constructor = ConcatChannels
module.exports = ConcatChannels

ConcatChannels.prototype._tick = function() {
  var nCOut = this.a.length + this.b.length
  for(var c=0; c<this.a.length; c++) {
    var outChunk = this.out[c] = this.out[c] || new Float32Array(this.OUT.chunkSize)
    var inChunk = this.a[c]
    for(var t=0; t<inChunk.length; t++)
      outChunk[t] = inChunk[t]
  }
  for(c=c; c<nCOut; c++) {
    var outChunk = this.out[c] = this.out[c] || new Float32Array(this.OUT.chunkSize)
    var inChunk = this.b[c-this.a.length]
    for(var t=0; t<inChunk.length; t++)
      outChunk[t] = inChunk[t]
  }
}

},{"../Unit.js":109}],120:[function(require,module,exports){
const Unit = require("../Unit.js")

function CrossFader(a, b, dial) {
  Unit.call(this)
  this.addInlet("a", {type:"audio"})
  this.addInlet("b", {type:"audio"})
  this.addInlet("dial", {mono: true, min:0, max:1, zero:0.5})
  this.addOutlet("out", {type:"audio"})

  this.A = a || 0
  this.B = b || 0
  this.DIAL = dial || 0 // 0: all A, 1: all B
}
CrossFader.prototype = Object.create(Unit.prototype)
CrossFader.prototype.constructor = CrossFader
module.exports = CrossFader

const zeroChannel = new Float32Array(Unit.standardChunkSize).fill(0)

CrossFader.prototype._tick = function() {
  for(var c=0; c<this.a.length || c<this.b.length; c++) {
    var aChannel = this.a[c] || zeroChannel
    var bChannel = this.b[c] || zeroChannel
    this.out[c] = this.out[c] || new Float32Array(aChannel.length)
    for(var t=0; t<aChannel.length; t++) {
      this.out[c][t] = (1-this.dial[t])*aChannel[t] + this.dial[t] * bChannel[t]
    }
  }
}

},{"../Unit.js":109}],121:[function(require,module,exports){
const Unit = require("../Unit.js")

function DecibelToScaler(input) {
  Unit.call(this)
  this.addInlet("in", {measuredIn:"dB"})
  this.addOutlet("out")
  this.IN = input || 0
}
DecibelToScaler.prototype = Object.create(Unit.prototype)
DecibelToScaler.prototype.constructor = DecibelToScaler
module.exports = DecibelToScaler

DecibelToScaler.prototype._tick = function() {
  for(var c=0; c<this.in.length; c++) {
    this.out[c] = this.out[c] || new Float32Array(this.in[c].length)
    for(var t=0; t<this.in[c].length; t++)
      this.out[c][t] = Math.pow(10, this.in[c][t]/20)
  }
}

},{"../Unit.js":109}],122:[function(require,module,exports){
const Unit = require("../Unit.js")
const config = require("../config.js")

const zeroChunk = new Float32Array(config.standardChunkSize).fill(0)

class Delay extends Unit {
  constructor(input = 0, delay = 4410, maxDelay = Unit.sampleRate * 5) {
    super()
    this.addInlet("in")
    this.addInlet("delay", {measuredIn:"samples"})
    this.addOutlet("out")

    this.maxDelay = maxDelay
    this.buffers = [new Float32Array(this.maxDelay)]

    this.IN = input
    this.DELAY = delay
  }

  _tick(clock) {
    // loop through channels
    for(var c=0; c<this.in.length || c<this.delay.length; c++) {
      // create output channel if doesn't exist
      this.out[c] = this.out[c] || new Float32Array(this.OUT.chunkSize)

      // choose input channel to write
      this.in[c] = this.in[c%this.in.length]

      // create buffer channel if doesn't exist
      this.buffers[c] = this.buffers[c] || new Float32Array(this.maxDelay)

      var delayChunk = this.delay[c%this.delay.length]
      for(var t=0; t<this.in[c].length; t++) {
        var tBuffer = (clock + t)%this.buffers[c].length
        this.out[c][t] = this.buffers[c][tBuffer]
        this.buffers[c][tBuffer] = 0
        if(this.delay[c][t] >= this.buffers[c].length)
          console.log(
            this.label+":", "delay time exceded buffer size by",
            delayChunk[t]-this.buffers[c].length+1,
            "samples (channel: " + c + ")"
          )
        var tWrite = (tBuffer + delayChunk[t])%this.buffers[c].length
        this.buffers[c][Math.floor(tWrite)] += this.in[c][t] * (1-tWrite%1)
        this.buffers[c][Math.ceil(tWrite)] += this.in[c][t] * (tWrite%1)

      }
    }
  }
}
module.exports = Delay

},{"../Unit.js":109,"../config.js":177}],123:[function(require,module,exports){
const Unit = require("../Unit.js")

function Divide(a, b) {
  Unit.call(this)
  this.addInlet("a")
  this.addInlet("b")
  this.addOutlet("out")

  this.A = a || 1
  this.B = b || 1
}
Divide.prototype = Object.create(Unit.prototype)
Divide.prototype.constructor = Divide
module.exports = Divide

Divide.prototype._tick = function(clock) {
  var outData = this.out
  var chunkSize = this.OUT.chunkSize
  for(var c=0; c<this.a.length || c<this.b.length; c++) {
    var aChan = this.a[c%this.a.length]
    var bChan = this.b[c%this.b.length]
    var outChan = outData[c] = outData[c] || new Float32Array(chunkSize)
    for(var t=0; t<chunkSize; t++) {
      outChan[t] = aChan[t] / bChan[t]
    }
  }
}

},{"../Unit.js":109}],124:[function(require,module,exports){
// A butterworth filter

const Unit = require("../Unit.js")

function Filter(input, f, kind) {
  Unit.call(this)

  this.addInlet("in", {type:"audio"})
  this.addInlet("f", {mono: true, measuredIn:"Hz"})
  this.addOutlet("out", {type:"audio"})

  if(input)
    this.IN = input
  if(f)
    this.F = f
  this.kind = kind || "LP"

  this.x1 = [] // input delayed by one samples for each channel
  this.x2 = [] // input delated by two samples for each channel
  this.y1 = [] // output delayed by one samples for each channel
  this.y2 = [] // output delayed by two samples for each channel
}
Filter.prototype = Object.create(Unit.prototype)
Filter.prototype.constructor = Filter
module.exports = Filter

Filter.prototype._tick = function() {
  var numberOfChannels = this.in.length
  var chunkSize = this.IN.chunkSize

  while(this.out.length < this.in.length)
    this.out.push(new Float32Array(this.OUT.chunkSize))
  for(var t=0; t<chunkSize; t++) {
    if(this.f[t] != this.lastF) {
      this.lastF = this.f[t]
      this.calculateCoefficients(this.f[t])
    }
    for(var c=0; c<numberOfChannels; c++) {
      //this.out[c][t] = this.a0 * this.in[c][t] - this.a2 * (this.x2[c] || 0) - this.b1 * (this.y1[c] || 0) - this.b2 * (this.y2[c] || 0) /*
      this.out[c][t] = this.a0 * this.in[c][t]
                      + this.a1 * (this.x1[c] || 0)
                      + this.a2 * (this.x2[c] || 0)
                      - this.b1 * (this.y1[c] || 0)
                      - this.b2 * (this.y2[c] || 0)//*/
      this.y2[c] = this.y1[c] || 0
      this.y1[c] = this.out[c][t]
      this.x2[c] = this.x1[c] || 0
      this.x1[c] = this.in[c][t]
    }
  }
}

Filter.prototype.__defineGetter__("kind", function() {
  return this._kind
})
Filter.prototype.__defineSetter__("kind", function(kind) {
  this.calculateCoefficients = Filter.coefficientFunctions[kind]
  if(!this.calculateCoefficients)
    throw "invalid filter type: " + kind
  if(kind == 'HP')
    console.warn("Please note: High Pass filter has a bug and doesn't work")
  this._kind = kind
  this.calculateCoefficients()
})

Filter.coefficientFunctions = {
  LP: function(f) {
    var lamda = 1/Math.tan(Math.PI * f/this.sampleRate)
    var lamdaSquared = lamda * lamda
    this.a0 = 1/(1 + 2*lamda + lamdaSquared)
    this.a1 = 2 * this.a0
    this.a2 = this.a0
    this.b1 = 2 * this.a0 * (1 - lamdaSquared)
    this.b2 = this.a0 * (1 - 2 * lamda + lamdaSquared)
  },
  HP: function(f) {
    var lamda = Math.tan(Math.PI * f / this.sampleRate) // checked
    var lamdaSquared = lamda * lamda // checked
    this.a0 = 1/(1 + 2*lamda + lamdaSquared) // checked
    this.a1 = 0//2 * this.a0 //checked
    this.a2 = -this.a0 // checked
    this.b1 = 2 * this.a0 * (lamdaSquared-1)
    this.b2 = this.a0 * (1 - 2*lamda + lamdaSquared)
  },
  BP: function(f, bandwidth) {
    var lamda = 1/Math.tan(Math.PI * bandwidth/this.sampleRate)
    var phi = 2 * Math.cos(2*Math.PI * f/this.sampleRate)
    this.a0 = 1/(1+lamda)
    this.a1 = 0
    this.a2 = -this.a0
    this.b1 = - lamda * phi * this.a0
    this.b2 = this.a0 * (lamda - 1)
  },
  BR: function(f, bandwidth) {
    var lamda = Math.tan(Math.PI * bandwidth/this.sampleRate)
    var phi = 2 * Math.cos(2*Math.PI * f/this.sampleRate)
    this.a0 = 1/(1+lamda)
    this.a1 = - phi * this.a0
    this.a2 = this.a0
    this.b1 = - phi * this.a0
    this.b2 = this.a0 * (lamda - 1)
    console.log(f, this)
  },
}

},{"../Unit.js":109}],125:[function(require,module,exports){
const Unit = require("../Unit.js")

class FixedDelay extends Unit {
  constructor(delayTime) {
    super()

    this.addInlet("in", {mono: true, type:"audio"})
    this.addOutlet("out", {mono: true, type:"audio"})

    this.setSeconds(delayTime)
    this.tBuffer = 0
  }

  _tick() {
    for(var t=0; t<this.in.length; t++) {
      this.tBuffer = (this.tBuffer+1)%this.buffer.length
      this.out[t] = this.buffer[this.tBuffer]
      this.buffer[this.tBuffer] = this.in[t]
    }
  }

  setDelayTime(tSamples) {
    if(!tSamples || tSamples < 0.5)
      throw "Cannot have fixed delay of length 0 samples"
    this.delayTimeInSamples = Math.round(tSamples)
    this.delayTimeInSeconds = tSamples/this.sampleRate
    this.buffer = new Float32Array(this.delayTimeInSamples)
  }

  setSeconds(duration) {
    this.setDelayTime(duration*this.sampleRate)
  }

  setFrequency(f) {
    this.setSeconds(1/f)
  }
}
module.exports = FixedDelay

},{"../Unit.js":109}],126:[function(require,module,exports){
const Unit = require("../Unit.js")

function FixedMultiply(sf, input) {
  Unit.call(this)

  this.addInlet("in", {mono: true})
  this.addOutlet("out", {mono: true})

  this.sf = sf

  this.IN = input || 0
}
FixedMultiply.prototype = Object.create(Unit.prototype)
FixedMultiply.prototype.constructor = FixedMultiply
module.exports = FixedMultiply

FixedMultiply.prototype.isFixedMultiply = true

FixedMultiply.prototype._tick = function() {
  for(var t=0; t<this.in.length; t++)
    this.out[t] = this.in[t] * this.sf
}

},{"../Unit.js":109}],127:[function(require,module,exports){
const Unit = require("../Unit.js")

function Gain(gain) {
  Unit.call(this)
  this.addInlet("in")
  this.addInlet("gain", {mono: true, measuredIn: "dB"})
  this.addOutlet("out")

  this.GAIN = gain || 0
}
Gain.prototype = Object.create(Unit.prototype)
Gain.prototype.constructor = Gain
module.exports = Gain

Gain.prototype.isGain

Gain.prototype._tick = function() {
  for(var c=0; c<this.in.length; c++) {
    if(this.out[c] == undefined)
      this.out[c] = new Float32Array(this.OUT.chunkSize)
    for(var t=0; t<Unit.standardChunkSize; t++)
      this.out[c][t] = dB(this.gain[t]) * this.in[c][t]
  }
}

function dB(db) { // decibel to scale factor (for amplitude calculations)
  return Math.pow(10, db/20);
}

},{"../Unit.js":109}],128:[function(require,module,exports){
const Unit = require("../Unit.js")

function GreaterThan(input, val) {
  console.log("WARNING GreaterThan is untested!")
  Unit.call(this)
  this.addInlet("in", {mono: true})
  this.addInlet("val", {mono: true})
  this.addOutlet("out", "bool")

  this.IN = input || 0
  this.VAL = val || 0
}
GreaterThan.prototype = Object.create(Unit.prototype)
GreaterThan.prototype.constructor = GreaterThan
module.exports = GreaterThan

GreaterThan.prototype._tick = function() {
  for(var t=0; t<this.in.length; t++) {
    this.out[t] = (this.in[t] > this.val[t])
  }
}

},{"../Unit.js":109}],129:[function(require,module,exports){
const Unit = require("../Unit.js")

class HardClipAbove extends Unit {
  constructor(input, threshold) {
    super()
    this.addInlet("in")
    this.addInlet("threshold")
    this.addOutlet("out")

    this.IN = input || 0
    this.THRESHOLD = threshold || 0
  }

  _tick() {
    for(var c=0; c<this.in.length; c++) {
      this.out[c] = this.out[c] || new Float32Array(this.OUT.chunkSize)
      var threshold = this.threshold[c%this.threshold.length]
      for(var t=0; t<this.in[c].length; t++)
        if(this.in[c][t] > threshold[t])
          this.out[c][t] = threshold[t]
        else
          this.out[c][t] = this.in[c][t]
    }
  }
}
module.exports = HardClipAbove

},{"../Unit.js":109}],130:[function(require,module,exports){
const Unit = require("../Unit.js")

class HardClipBelow extends Unit {
  constructor(input, threshold) {
    super()
    this.addInlet("in")
    this.addInlet("threshold")
    this.addOutlet("out")

    this.IN = input || 0
    this.THRESHOLD = threshold || 0
  }

  _tick() {
    for(var c=0; c<this.in.length; c++) {
      this.out[c] = this.out[c] || new Float32Array(this.OUT.chunkSize)
      var threshold = this.threshold[c%this.threshold.length]
      for(var t=0; t<this.in[c].length; t++)
        if(this.in[c][t] < threshold[t])
          this.out[c][t] = threshold[t]
        else
          this.out[c][t] = this.in[c][t]
    }
  }
}
module.exports = HardClipBelow

},{"../Unit.js":109}],131:[function(require,module,exports){
const Unit = require("../Unit.js")

function LessThan(input, val) {
  console.log("WARNING: LessThan is untested")
  Unit.call(this)
  this.addInlet("in", {mono: true})
  this.addInlet("val", {mono: true})
  this.addOutlet("out", "bool")

  this.IN = input || 0
  this.VAL = val || 0
}
LessThan.prototype = Object.create(Unit.prototype)
LessThan.prototype.constructor = LessThan
module.exports = LessThan

LessThan.prototype._tick = function() {
  for(var t=0; t<this.in.length; t++) {
    this.out[t] = (this.in[t] < this.val[t])
  }
}

},{"../Unit.js":109}],132:[function(require,module,exports){
const Unit = require("../Unit.js")

function MidiToFrequency(midi) {
  Unit.call(this)
  this.addInlet("midi", {type:"midi"})
  this.addOutlet("frequency", {measuredIn: "Hz"})

  this.MIDI = midi || 69
}
MidiToFrequency.prototype = Object.create(Unit.prototype)
MidiToFrequency.prototype.constructor = MidiToFrequency
module.exports = MidiToFrequency

MidiToFrequency.prototype._tick = function() {
  for(var c=0; c<this.midi.length; c++) {
    var midiIn = this.midi[c]
    var fOut = this.frequency[c] || new Float32Array(this.FREQUENCY.chunkSize)
    for(var t=0; t<midiIn.length; t++)
      fOut[t] = Math.pow(2, ((midiIn[t]-69)/12)) * 440
  }
}

},{"../Unit.js":109}],133:[function(require,module,exports){
const Unit = require("../Unit.js")

function Monitor(input) {
  Unit.call(this)
  this.addInlet("in")

  this.IN = input
}
Monitor.prototype = Object.create(Unit.prototype)
Monitor.prototype.constructor = Monitor
module.exports = Monitor

Monitor.prototype._tick = function() {
  console.log(this.in)
}

},{"../Unit.js":109}],134:[function(require,module,exports){
const Unit = require("../Unit.js")

function MonoDelay(input, delay) {
  Unit.call(this)
  this.addInlet("in", {mono: true, type:"audio"})
  this.addInlet("delay", {mono: true, measuredIn: "samples"})
  this.addOutlet("out", {mono: true, type:"audio"})

  this.maxDelay = Unit.sampleRate * 5
  this.buffer = new Float32Array(this.maxDelay)

  this.IN = input || 0
  this.DELAY = delay || 4410
}
MonoDelay.prototype = Object.create(Unit.prototype)
MonoDelay.prototype.constructor = MonoDelay
module.exports = MonoDelay

MonoDelay.prototype._tick = function(clock) {
  for(var t=0; t<this.in.length; t++) {
    var tBuffer = (clock + t)%this.buffer.length
    if(this.delay[t] >= this.buffer.length)
      console.log(this.label+":", "delay time exceded buffer size by", this.delay[t]-this.buffer.length+1, "samples")
    var tWrite = (tBuffer + this.delay[t])%this.buffer.length
    this.buffer[Math.floor(tWrite)] += this.in[t] * (1-tWrite%1)
    this.buffer[Math.ceil(tWrite)%this.buffer.length] += this.in[t] * (tWrite%1)
    this.out[t] = this.buffer[tBuffer]
    this.buffer[tBuffer] = 0
  }
}

},{"../Unit.js":109}],135:[function(require,module,exports){
const Unit = require("../Unit.js")
const dusp = require("../dusp")

function Multiply(a, b) {
  Unit.call(this)
  this.addInlet("a")
  this.addInlet("b")
  this.addOutlet("out")

  this.A = a || 1
  this.B = b || 1
}
Multiply.prototype = Object.create(Unit.prototype)
Multiply.prototype.constructor = Multiply
Multiply.prototype.isMultiply = true
module.exports = Multiply

Multiply.prototype.dusp = {
  shorthand: function(index) {
    return "(" + dusp(this.A, index) + " * " + dusp(this.B, index) + ")"
  }
}

Multiply.prototype._tick = function(clock) {
  var outData = this.out
  var chunkSize = this.OUT.chunkSize
  for(var c=0; c<this.a.length || c<this.b.length; c++) {
    var aChan = this.a[c%this.a.length]
    var bChan = this.b[c%this.b.length]
    var outChan = outData[c] = outData[c] || new Float32Array(chunkSize)
    for(var t=0; t<chunkSize; t++) {
      outChan[t] = aChan[t] * bChan[t]
    }
  }
}

},{"../Unit.js":109,"../dusp":187}],136:[function(require,module,exports){
const Unit = require("../Unit.js")

function Noise(f) {
  Unit.call(this)
  this.addInlet("f", {measuredIn:"Hz"})
  this.addOutlet("out", {type:"audio"})

  this.F = f || Unit.sampleRate
  this.phase = 0
  this.y = Math.random()*2 - 1
}
Noise.prototype = Object.create(Unit.prototype)
Noise.prototype.constructor = Noise
module.exports = Noise

Noise.prototype._tick = function() {
  for(var c in this.out) {
    var outChan = this.out[c]
    for(var t=0; t<outChan.length; t++) {
      this.phase += this.f[0][t]
      if(this.phase >= Unit.sampleRate) {
        this.phase = 0
        this.y = 2 * Math.random() - 1
      }
      outChan[t] = this.y
    }
  }
}

},{"../Unit.js":109}],137:[function(require,module,exports){
const Unit = require("../../Unit.js")
const config = require("../../config.js")
const waveTables = require("./waveTables.js")

const PHI = 2 * Math.PI

function MultiChannelOsc(f, waveform) {
  Unit.call(this)

  this.addInlet("f", {measuredIn:"Hz"})
  this.addOutlet("out", {type:"audio"})

  this.F = f || 440
  this.phase = []
  this.waveform = waveform || "sin"
}
MultiChannelOsc.prototype = Object.create(Unit.prototype)
MultiChannelOsc.prototype.constructor = MultiChannelOsc
module.exports = MultiChannelOsc

MultiChannelOsc.prototype._tick = function(clock) {
  for(var c=0; c<this.f.length; c++) {
    this.phase[c] = this.phase[c] || 0
    this.out[c] = this.out[c] || new Float32Array(this.OUT.chunkSize)

    var f = this.f[c]
    var dataOut = this.out[c]

    var fraction
    for(var t=0; t<dataOut.length; t++) {
      this.phase[c] += f[t]
      this.phase[c] %= Unit.sampleRate
      fraction = this.phase[c]%1
      dataOut[t] = this.waveTable[Math.floor(this.phase[c])] * (1-fraction)
                    + this.waveTable[Math.ceil(this.phase[c])] * fraction
    }
  }
}

MultiChannelOsc.prototype.__defineGetter__("waveform", function() {
  return this._waveform
})
MultiChannelOsc.prototype.__defineSetter__("waveform", function(waveform) {
  if(waveform == "random") {
    var all = Object.keys(waveTables)
    waveform = all[Math.floor(Math.random()*all.length)]
  }
  this._waveform = waveform
  this.waveTable = waveTables[waveform]
  if(!this.waveTable)
    throw "waveform doesn't exist: " + waveform
})

MultiChannelOsc.prototype.resetPhase = function() {
  for(var i in this.phase)
    this.phase[i] = 0
}
MultiChannelOsc.prototype.randomPhaseFlip = function() {
  if(Math.random() < 0.5)
    for(var i in this.phase)
      this.phase[i] += config.sampleRate/2
}

},{"../../Unit.js":109,"../../config.js":177,"./waveTables.js":140}],138:[function(require,module,exports){

const Unit = require("../../Unit.js")
const waveTables = require("./waveTables.js")

const PHI = 2 * Math.PI

function Osc(f, waveform) {
  Unit.call(this)

  //console.log(this)
  this.addInlet("f", {mono: true, measuredIn:"Hz"})
  this.addOutlet("out", {mono: true, type:"audio"})

  this.F = f || 440
  this.phase = 0
  this.waveform = waveform || "sin"
}
Osc.prototype = Object.create(Unit.prototype)
Osc.prototype.constructor = Osc
module.exports = Osc

Osc.prototype.dusp = {
  extraProperties: {
    waveform: "sin",
  },
  shorthand: function() {
    if(this.waveform == "sin") {
      if(!this.F.connected) {
        return "O" + this.F.constant
      }
    }
  }
}

Osc.prototype._tick = function(clock) {
  var dataOut = this.out
  var fraction
  for(var t=0; t<dataOut.length; t++) {
    this.phase += this.f[t]
    this.phase %= Unit.sampleRate
    if(this.phase < 0)
      this.phase += Unit.sampleRate
    fraction = this.phase%1
    dataOut[t] = this.waveTable[Math.floor(this.phase)] * (1-fraction)
                  + this.waveTable[Math.ceil(this.phase)] * fraction
  }
}

Osc.prototype.__defineGetter__("waveform", function() {
  return this._waveform
})
Osc.prototype.__defineSetter__("waveform", function(waveform) {
  if(waveform == "random") {
    var all = Object.keys(waveTables)
    waveform = all[Math.floor(Math.random()*all.length)]
  }
  this._waveform = waveform
  this.waveTable = waveTables[waveform]
  if(!this.waveTable)
    throw "waveform doesn't exist: " + waveform
})

Osc.prototype.randomPhaseFlip = function() {
  if(Math.random() < 0.5)
    this.phase += Unit.sampleRate/2
}

},{"../../Unit.js":109,"./waveTables.js":140}],139:[function(require,module,exports){
module.exports = require("./Osc")
//module.exports.MultiChannelOsc = require("./MultiChannelOsc")

},{"./Osc":138}],140:[function(require,module,exports){
const config = require("../../config.js")

const PHI = 2 * Math.PI

var sineTable = new Float32Array(config.sampleRate+1)
for(var t=0; t<sineTable.length; t++) {
  sineTable[t] = Math.sin(PHI * t/sineTable.length)
}

var sawTable = new Float32Array(config.sampleRate+1)
for(var t=0; t<config.sampleRate; t++)
  sawTable[t] = -1 + t * 2/sawTable.length

var triangleTable = new Float32Array(config.sampleRate+1)
var quarterSampleRate = config.sampleRate/4
for(var t=0; t<quarterSampleRate; t++) {
  triangleTable[t] = t/config.sampleRate * 4
  triangleTable[t+quarterSampleRate] = 1-triangleTable[t]
  triangleTable[t+quarterSampleRate*2] = -triangleTable[t]
  triangleTable[t+quarterSampleRate*3] = -1+triangleTable[t]
}
triangleTable[config.sampleRate] = 0

var squareTable = new Float32Array(config.sampleRate+1)
squareTable.fill(1, 0, config.sampleRate/2)
squareTable.fill(-1, config.sampleRate/2, config.sampleRate+1)

twoToTheSeven = Math.pow(2, 7)
eightBitTable = sineTable.map(sample =>
  Math.round(sample * twoToTheSeven)/twoToTheSeven
)

module.exports = {
  sin: sineTable,
  sine: sineTable,
  saw: sawTable,
  square: squareTable,
  triangle: triangleTable,
  "8bit": eightBitTable,
}

},{"../../config.js":177}],141:[function(require,module,exports){
const Unit = require("../Unit.js")

function Pan(input, pan) {
  Unit.call(this)

  this.addInlet("in", {mono: true, type:"audio"})
  this.addInlet("pan", {mono: true, min:-1, max:1})
  this.addOutlet("out", {numberOfChannels:2, type:"audio"})

  this.PAN = pan || 0
  this.IN = input || 0
  this.compensationDB = 1.5
}
Pan.prototype = Object.create(Unit.prototype)
Pan.prototype.constructor = Pan
module.exports = Pan

Pan.prototype._tick = function() {
  for(var t=0; t<this.out[0].length; t++) {
    var compensation = dB((1-Math.abs(this.pan[t])) * this.compensationDB)
    this.out[0][t] = this.in[t] * (1-this.pan[t])/2 * compensation
    this.out[1][t] = this.in[t] * (1+this.pan[t])/2 * compensation
  }
}

function dB(db) { // decibel to scale factor (for amplitude calculations)
  return Math.pow(10, db/20);
}

},{"../Unit.js":109}],142:[function(require,module,exports){
const Unit = require("../Unit.js")

function PickChannel(input, c) {
  Unit.call(this)
  this.addInlet("in")
  this.addInlet("c", {mono: true})
  this.addOutlet("out", {mono: true})

  this.IN = input || 0
  this.C = c || 0
}
PickChannel.prototype = Object.create(Unit.prototype)
PickChannel.prototype.constructor = PickChannel
module.exports = PickChannel

PickChannel.prototype._tick = function() {
  var chunkSize = this.OUT.chunkSize
  for(var t=0; t<chunkSize; t++) {
    this.out[t] = this.in[this.c[t] % this.in.length][t]
  }
}

},{"../Unit.js":109}],143:[function(require,module,exports){
const Unit = require("../Unit.js")

class PolarityInvert extends Unit {
  constructor(input) {
    super()

    this.addInlet("in")
    this.addOutlet("out")

    this.IN = input || 0
  }

  _tick() {
    for(var c=0; c<this.in.length; c++) {
      this.out[c] = this.out[c] || new Float32Array(this.OUT.chunkSize)
      for(var t=0; t<this.in[c].length; t++) {
        this.out[c][t] = -this.in[c][t]
      }
    }
  }
}
module.exports = PolarityInvert

},{"../Unit.js":109}],144:[function(require,module,exports){
const Unit = require("../Unit.js")

class Pow extends Unit {
  constructor(a, b) {
    super()
    this.addInlet("a")
    this.addInlet("b")
    this.addOutlet("out")
    this.A = a
    this.B = b
  }

  /*dusp: {
    shorthand: function(index) {
      return "(" + dusp(this.A, index) + " ^ " + dusp(this.B, index) + ")"
    }
  }*/

  _tick() {
    var outData = this.out
    var chunkSize = this.OUT.chunkSize
    for(var c=0; c<this.a.length || c<this.b.length; c++) {
      var aChan = this.a[c%this.a.length]
      var bChan = this.b[c%this.b.length]
      var outChan = outData[c] = outData[c] || new Float32Array(chunkSize)
      for(var t=0; t<chunkSize; t++) {
        outChan[t] = Math.pow(aChan[t], bChan[t])
      }
    }
  }
}
module.exports = Pow

},{"../Unit.js":109}],145:[function(require,module,exports){
const Unit = require("../Unit.js")

function Ramp(duration, y0, y1) {
  Unit.call(this)

  this.addOutlet("out", {mono: true, type:"control"})

  this.duration = duration || this.sampleRate
  this.y0 = y0 || 1
  this.y1 = y1 || 0

  this.t = 0
  this.playing = false
}
Ramp.prototype = Object.create(Unit.prototype)
Ramp.prototype.constructor = Ramp
module.exports = Ramp

Ramp.prototype.trigger = function() {
  this.playing = true
  this.t = 0
  return this
}

Ramp.prototype._tick = function() {
  for(var tChunk=0; tChunk<this.out.length; tChunk++) {
    if(this.playing) {
      this.t++
      if(this.t > this.duration) {
        this.playing = false
        this.t = this.duration
      }
      if(this.t < 0) {
        this.playing = false
        this.t = 0
      }
    }
    this.out[tChunk] = this.y0 + (this.t/this.duration) * (this.y1-this.y0)
  }
}

},{"../Unit.js":109}],146:[function(require,module,exports){
const Unit = require("../Unit.js")
const config = require("../config.js")

function ReadBackDelay(input, delay, bufferLength) {
  Unit.call(this)

  this.addInlet("in")
  this.addInlet("delay", {measuredIn:"samples"})
  this.addOutlet("out")

  this.buffer = []
  this.bufferLength = bufferLength || config.sampleRate
  this.tBuffer = 0 // write head time within buffer

  this.IN = input || 0
  this.DELAY = delay || 0
}
ReadBackDelay.prototype = Object.create(Unit.prototype)
ReadBackDelay.prototype.constructor = ReadBackDelay
module.exports = ReadBackDelay


ReadBackDelay.prototype._tick = function() {
  var t0 = this.tBuffer
  var t1 = t0 + this.tickInterval
  for(var c=0; c<this.in.length || c<this.delay.length; c++) {
    var input = this.in[c%this.in.length]
    var delay = this.delay[c%this.delay.length]
    var output = this.out[c] = this.out[c] || new Float32Array(this.OUT.chunkSize)
    var buffer = this.buffer[c] = this.buffer[c] || new Float32Array(this.bufferLength)

    var i = 0
    for(var t=t0; t<t1; t++) {
      if(delay[i] > this.bufferLength)
        throw "delay may not exceed buffer length ("+this.label+")"

      buffer[(t+buffer.length)%buffer.length] = input[i]
      output[i] = buffer[(t-delay[i] + buffer.length) % buffer.length]
      i++
    }
  }
  this.tBuffer = t1
}

},{"../Unit.js":109,"../config.js":177}],147:[function(require,module,exports){
const Unit = require("../Unit.js")

function Repeater(val, measuredIn) {
  Unit.call(this)
  this.addInlet("in", {measuredIn:measuredIn})
  this.addOutlet("out", {measuredIn:measuredIn})
  this.measuredIn = measuredIn

  this.IN = val || 0
}
Repeater.prototype = Object.create(Unit.prototype)
Repeater.prototype.constructor = Repeater
module.exports = Repeater

Repeater.prototype.dusp = {
  extraArgs: function() {
    if(this.measuredIn)
      return ["\""+this.measuredIn+"\""]
    else return null
  }
}

Repeater.prototype._tick = function() {
  for(var c=0; c<this.in.length; c++) {
    this.out[c] = this.out[c] || new Float32Array(this.in[c].length)

    for(var t=0; t<this.in[c].length; t++)
      this.out[c][t] = this.in[c][t]
  }
}

},{"../Unit.js":109}],148:[function(require,module,exports){
const Unit = require("../Unit.js")

function Rescale(inLower, inUpper, outLower, outUpper) {
  Unit.call(this)
  this.addInlet("in")
  this.addInlet("inLower")
  this.addInlet("inUpper")
  this.addInlet("outLower")
  this.addInlet("outUpper")
  this.addOutlet("out")

  this.IN = 0
  this.INLOWER = inLower || -1
  this.INUPPER = inUpper || 1
  this.OUTLOWER = outLower || 0
  this.OUTUPPER = outUpper || 1
}
Rescale.prototype = Object.create(Unit.prototype)
Rescale.prototype.constructor = Rescale
module.exports = Rescale

Rescale.prototype.isRescale = true

Rescale.prototype._tick = function() {
  for(var c=0; c<this.in.length; c++) {
    var inChan = this.in[c]
    var outChan = this.out[c] = this.out[c] || new Float32Array(Unit.standardChunkSize)
    var inLowerChan = this.inLower[c%this.inLower.length]
    var inUpperChan = this.inUpper[c%this.inUpper.length]
    var outLowerChan = this.outLower[c%this.outLower.length]
    var outUpperChan = this.outUpper[c%this.outUpper.length]
    for(var t=0; t<inChan.length; t++) {
      outChan[t] = (inChan[t]-inLowerChan[t])/(inUpperChan[t]-inLowerChan[t]) *
                    (outUpperChan[t] - outLowerChan[t]) + outLowerChan[t]
    }
  }
}

},{"../Unit.js":109}],149:[function(require,module,exports){
const Unit = require("../Unit.js")

class Retriggerer extends Unit {
  constructor(target, rate) {
    super()
    this.addInlet("rate", {mono:true, type:"frequency"})
    if(target)
      this.target = target
    this.t = 0
    this.RATE = rate || 1
  }

  _tick() {
    for(var t=0; t<this.rate.length; t++) {
      this.t += this.rate[t]
      if(this.t >= this.sampleRate) {
        if(this._target && this._target.trigger)
          this._target.trigger()
        this.t %= this.sampleRate
      }
    }
  }

  get target() {
    return this._target
  }
  set target(target) {
    if(this._target)
      this.unChain(target)
    if(target) {
      this._target = target
      this.chainBefore(target)
    }
  }
}
module.exports = Retriggerer

},{"../Unit.js":109}],150:[function(require,module,exports){
const Unit = require("../Unit.js")

function SampleRateRedux(input, ammount) {
  Unit.call(this)
  this.addInlet("in")
  this.addInlet("ammount", {mono: true})
  this.addOutlet("out")

  this.val = [0]
  this.timeSinceLastUpdate = Infinity


  this.IN = input || 0
  this.AMMOUNT = ammount || 0
}
SampleRateRedux.prototype = Object.create(Unit.prototype)
SampleRateRedux.prototype.constructor = SampleRateRedux
module.exports = SampleRateRedux

SampleRateRedux.prototype._tick = function() {
  var chunkSize = this.OUT.chunkSize
  while(this.out.length < this.in.length)
    this.out.push( new Float32Array(chunkSize) )
  for(var t=0; t<chunkSize; t++) {
    this.timeSinceLastUpdate++
    if(this.timeSinceLastUpdate > this.ammount[t]) {
      this.val = []
      for(var c=0; c<this.in.length; c++)
        this.val[c] = this.in[c][t]
      this.timeSinceLastUpdate = 0
    }
    for(var c=0; c<this.val.length; c++) {
      this.out[c][t] = this.val[c]
    }
  }
}

},{"../Unit.js":109}],151:[function(require,module,exports){
const Unit = require("../Unit.js")
const config = require('../config.js')

function SecondsToSamples() {
  Unit.call(this)
  this.addInlet("in", {measuredIn: "s"})
  this.addOutlet("out", {measuredIn: "samples"})
}
SecondsToSamples.prototype = Object.create(Unit.prototype)
SecondsToSamples.prototype.constructor = SecondsToSamples
module.exports = SecondsToSamples

SecondsToSamples.prototype._tick = function() {
  for(var c in this.in) {
    if(this.out[c] == undefined)
      this.out[c] = new Float32Array(this.OUT.chunkSize)
    for(var t=0; t<this.in[c].length; t++)
      this.out[c][t] = this.in[c][t] * config.sampleRate
  }
}

},{"../Unit.js":109,"../config.js":177}],152:[function(require,module,exports){
const Unit = require("../Unit.js")

function SemitoneToRatio(midi) {
  Unit.call(this)
  this.addInlet("in")
  this.addOutlet("out")

  this.IN = midi || 69
}
SemitoneToRatio.prototype = Object.create(Unit.prototype)
SemitoneToRatio.prototype.constructor = SemitoneToRatio
module.exports = SemitoneToRatio

SemitoneToRatio.prototype._tick = function() {
  for(var c=0; c<this.in.length; c++) {
    var midiIn = this.in[c]
    var fOut = this.out[c] = this.out[c] || new Float32Array(this.OUT.chunkSize)

    for(var t=0; t<midiIn.length; t++)
      fOut[t] = Math.pow(2, (midiIn[t]/12))
  }
}

},{"../Unit.js":109}],153:[function(require,module,exports){
const Unit = require("../../Unit.js")
const config = require("../../config.js")
const Divide = require("../Divide.js")
const shapeTables = require("./shapeTables.js")


function Shape(shape, durationInSeconds, min, max) {
  Unit.call(this)
  this.addInlet("duration", {mono: true, type:"time", measuredIn:"s"})
  this.addInlet("min", {mono: true, type:"scalar"})
  this.addInlet("max", {mono: true, type:"scalar"})
  this.addOutlet("out", {mono: true, type:"control", min:0, max:1})

  this.t = 0

  this.playing = false
  this.leftEdge = 0
  this.rightEdge = "shape"
  this.shape = shape || "decay"
  this.DURATION = durationInSeconds || 1
  this.MIN = min || 0
  this.MAX = max || 1
}
Shape.prototype = Object.create(Unit.prototype)
Shape.prototype.constructor = Shape
module.exports = Shape

Shape.prototype._tick = function() {
  for(var t=0; t<this.out.length; t++) {

    if(this.playing)
      this.t += 1/this.duration[t]

    if(this.t <= 0) {
      if(this.leftEdge == "shape")
        this.out[t] = this.shapeTableData[0] * (this.max[t]-this.min[t]) + this.min[t]
      if(this.leftEdge.constructor == Number)
        this.out[t] = this.leftEdge * (this.max[t]-this.min[t]) + this.min[t]

    } else if(this.t > config.sampleRate) {
      if(!this.finished)
        this.finish()

      if(this.rightEdge == "shape") {
        this.out[t] = this.shapeTableData[config.sampleRate] * (this.max[t]-this.min[t]) + this.min[t]
      }
      else if(this.rightEdge.constructor == Number)
        this.out[t] = this.rightEdge * (this.max[t]-this.min[t]) + this.min[t]

    } else {
      this.out[t] =
      this.min[t] + ((this.max[t]-this.min[t])) *
        (
          this.shapeTableData[Math.ceil(this.t)] * (this.t%1) +
          this.shapeTableData[Math.floor(this.t)] * (1-this.t%1)
        )
    }
  }
}

Shape.prototype.dusp = {

  flagFunctions: {
    trigger: function() {
      this.trigger()
    },
  },

  extraArgs: function() {
    var args = []
    if(this.playing)
      args.push("trigger")
    return args
  },

  extraProperties: ["shape"],
}

/*Shape.prototype.flagFunctions = {
  trigger: function() {
    this.trigger()
  }
}
Shape.prototype.extraDuspArgs = function() {
  var args = []
  if(this.playing)
    args.push("trigger")
  return args
}
Shape.prototype.extraDuspProperties = ["shape"]*/

Shape.prototype.trigger = function() {
  this.playing = true
  this.t = 0
  return this
}
Shape.prototype.stop = function() {
  this.playing = false
}

Shape.prototype.__defineGetter__("shape", function() {
  return this._shape
})
Shape.prototype.__defineSetter__("shape", function(shape) {
  this._shape = shape
  this.shapeTable = shapeTables[shape]
  this.shapeTableData = this.shapeTable.data
  if(!this.shapeTable)
    throw this.label + ":\n\tinvalid shape function: " + shape
})

Shape.functions = { // btw: 0 >= x >= 1
  decay: function(x) {
    return 1-x
  },
  attack: function(x) {
    return x
  },
  semiSine: function(x) {
    return Math,sin(Math.PI * x)
  }
}

Shape.randomInRange = function(maxDuration, minMin, maxMax) {
  maxDuration = maxDuration || 1

  var a = minMin + Math.random() * (maxMax-minMin)
  var b = minMin + Math.random() * (maxMax-minMin)
  if(a > b) {
    var min = b
    var max = a
  } else {
    var min = a
    var max = b
  }

  return new Shape(
    Shape.randomShapeStr(),
    Math.random()*maxDuration,
    min,
    max,
  )
}

Shape.randomShapeStr = function() {
  var keys = Object.keys(shapeTables)
  return keys[Math.floor(Math.random()*keys.length)]
}

Shape.randomDecay = function(maxDuration) {
  return new Shape(
    "decaySquared",
    Math.random() * (maxDuration || 5),
  )
}

Shape.prototype.randomDecay = function(maxDuration) {
  this.shape = "decay"
  this.DURATION = Math.random() * (maxDuration || 5)
  this.MIN = 0
  this.MAX = 1
}

},{"../../Unit.js":109,"../../config.js":177,"../Divide.js":123,"./shapeTables.js":154}],154:[function(require,module,exports){
const config = require("../../config.js")

function makeTable(func, name) {
  var table = new Float32Array(config.sampleRate+1)
  var area = 0
  for(var x=0; x<table.length; x++) {
    table[x] = func(x/config.sampleRate)
    area += table[x]
  }

  area /= config.sampleRate+1

  return {
    data: table,
    name: name,
    area: area,
  }
}


module.exports = {
  decay: makeTable(
    (x) => { return 1-x },
    "decay"
  ),
  attack: makeTable(
    (x)=>{ return x },
    "attack"
  ),
  semiSine: makeTable(
    (x) => { return Math.sin(Math.PI * x) },
    "semiSine"
  ),
  decaySquared: makeTable(
    (x) => { return (1-x)*(1-x) },
    "decaySquared"
  )
}

},{"../../config.js":177}],155:[function(require,module,exports){
const Unit = require("../Unit.js")

function SignalCombiner(a, b) {
  Unit.call(this)

  this.addInlet("a")
  this.addInlet("b")
  this.addOutlet("out")

  this.A = a || 0
  this.B = b || 0
}
SignalCombiner.prototype = Object.create(Unit.prototype)
SignalCombiner.prototype.constructor = SignalCombiner
module.exports = SignalCombiner

SignalCombiner.prototype.collapseA = function() {
  var outInlets = this.OUT.connections
  for(var i in outInlets) {
    outInlets[i].connect(this.A.outlet)
  }
  this.A.disconnect()
  this.B.disconnect()
}
SignalCombiner.prototype.collapseB = function() {
  var outInlets = this.OUT.connections
  for(var i in outInlets) {
  //  console.log(this.label +".collapseB,", outInlets[i].label, ".connect(", this.B.outlet.label, ")")
    outInlets[i].connect(this.B.outlet)
  }
  this.A.disconnect()
  this.B.disconnect()
}

},{"../Unit.js":109}],156:[function(require,module,exports){
const Unit = require("../Unit.js")

class SporadicRetriggerer extends Unit {
  constructor(target, rate) {
    super()
    this.addInlet("rate", {mono:true, type:"frequency"})
    if(target)
      this.target = target
    this.RATE = rate || 1
  }

  _tick() {
    if(this._target && this._target.trigger)
      if(Math.random() < this.rate[0] * this.tickInterval / this.sampleRate)
        this._target.trigger()
  }

  get target() {
    return this._target
  }
  set target(target) {
    if(this._target)
      this.unChain(target)
    if(target) {
      this._target = target
      this.chainBefore(target)
    }
  }
}
module.exports = SporadicRetriggerer

},{"../Unit.js":109}],157:[function(require,module,exports){
const Unit = require("../Unit.js")
const config = require("../config.js")

function Subtract(A, B) {
  Unit.call(this)
  this.addInlet("a")
  this.addInlet("b")
  this.addOutlet("out")

  this.A = A || 0
  this.B = B || 0
}
Subtract.prototype = Object.create(Unit.prototype)
Subtract.prototype.constructor = Subtract
module.exports = Subtract

const zeroChunk = new Float32Array(config.standardChunkSize).fill(0)

Subtract.prototype._tick = function() {
  for(var c=0; c<this.a.length || c<this.b.length; c++) {
    if(!this.out[c])
      this.out[c] = new Float32Array(this.OUT.chunkSize)
    var aChunk = this.a[c] || zeroChunk
    var bChunk = this.b[c] || zeroChunk
    for(var t=0; t<aChunk.length; t++) {
      this.out[c][t] = aChunk[t] - bChunk[t]
    }
  }
}

},{"../Unit.js":109,"../config.js":177}],158:[function(require,module,exports){
const SignalCombiner = require("./SignalCombiner.js")
const config = require("../config.js")
const dusp = require("../dusp")

function Sum(a, b) {
  SignalCombiner.call(this, a, b)
}
Sum.prototype = Object.create(SignalCombiner.prototype)
Sum.prototype.constructor = Sum
Sum.prototype.isSum = true
module.exports = Sum

Sum.prototype.dusp = {
  shorthand: function(index) {
    return "("+dusp(this.A, index) + " + " + dusp(this.B, index)+")"
  }
}

Sum.many = function(inputs) {
  if(inputs.length == 1) {
    return inputs[0]
  }
  var sums = []
  sums[0] = new Sum(inputs[0], inputs[1])

  for(var i=2; i<inputs.length; i++)
    sums[i-1] = new Sum(sums[i-2], inputs[i])

  return sums[sums.length-1]
}

const zeroChannel = new Float32Array(config.standardChunkSize).fill(0)

Sum.prototype._tick = function() {
  for(var channel=0;
      channel<this.a.length || channel<this.b.length;
      channel++) {
    var aChan = this.a[channel%this.a.length] || zeroChannel
    var bChan = this.b[channel%this.b.length] || zeroChannel
    var outChan = this.out[channel]
                = (this.out[channel] || new Float32Array(config.standardChunkSize))
    for(var t=0; t<aChan.length || t<bChan.length; t++)
      outChan[t] = aChan[t] + bChan[t]
  }
}

},{"../config.js":177,"../dusp":187,"./SignalCombiner.js":155}],159:[function(require,module,exports){
const Unit = require("../Unit.js")

/*class Timer extends Unit {
  constructor() {
    suoer()

    this.addOutlet("out", "mono")
    this.t = 0

    this.samplePeriod = 1/this.sampleRate
  }

  _tick() {
    for(var t=0; t<this.out.length; t++) {
      this.t += this.samplePeriod
      this.out[t] = this.t
    }
  }

  trigger() {
    this.t = 0
  }
}
module.exports = Timer*/

function Timer() {
  Unit.call(this)
  this.addOutlet("out", {mono: true})

  this.t = 0
  this.samplePeriod = 1/this.sampleRate
}
Timer.prototype = Object.create(Unit.prototype)
Timer.prototype.constructor = Timer
module.exports = Timer

Timer.prototype._tick = function() {
  for(var t=0; t<this.out.length; t++) {
    this.t += this.samplePeriod
    this.out[t] = this.t
  }
}

Timer.prototype.trigger = function() {
  this.t = 0
}

},{"../Unit.js":109}],160:[function(require,module,exports){
const Unit = require("../Unit.js")

// Does a pythagorus across channels

function VectorMagnitude() {
  Unit.call(this)
  this.addInlet("in") // vector
  this.addOutlet("out", {mono: true})

  this.IN = [0,0]
}
VectorMagnitude.prototype = Object.create(Unit.prototype)
VectorMagnitude.prototype.constructor = VectorMagnitude
module.exports = VectorMagnitude

VectorMagnitude.prototype._tick = function() {
  var chunkSize = this.IN.chunkSize
  var nC = this.in.length
  for(var t=0; t<chunkSize; t++) {
    var squareSum = 0
    for(var c=0; c<nC; c++) {
      var x = this.in[c][t]
      squareSum += x*x
    }
    this.out[t] = Math.sqrt(squareSum)
    //console.log(this.out[t], this.in[0][t], this.in[1][t])
  }
}

},{"../Unit.js":109}],161:[function(require,module,exports){
module.exports = {
	AHD: require("./AHD.js"),
	Abs: require("./Abs.js"),
	AllPass: require("./AllPass.js"),
	CircleBufferNode: require("./CircleBufferNode.js"),
	CircleBufferReader: require("./CircleBufferReader.js"),
	CircleBufferWriter: require("./CircleBufferWriter.js"),
	Clip: require("./Clip.js"),
	CombFilter: require("./CombFilter.js"),
	ConcatChannels: require("./ConcatChannels.js"),
	CrossFader: require("./CrossFader.js"),
	DecibelToScaler: require("./DecibelToScaler.js"),
	Delay: require("./Delay.js"),
	Divide: require("./Divide.js"),
	Filter: require("./Filter.js"),
	FixedDelay: require("./FixedDelay.js"),
	FixedMultiply: require("./FixedMultiply.js"),
	Gain: require("./Gain.js"),
	GreaterThan: require("./GreaterThan.js"),
	HardClipAbove: require("./HardClipAbove.js"),
	HardClipBelow: require("./HardClipBelow.js"),
	LessThan: require("./LessThan.js"),
	MidiToFrequency: require("./MidiToFrequency.js"),
	Monitor: require("./Monitor.js"),
	MonoDelay: require("./MonoDelay.js"),
	Multiply: require("./Multiply.js"),
	Noise: require("./Noise.js"),
	MultiChannelOsc: require("./Osc/MultiChannelOsc.js"),
	Osc: require("./Osc/Osc.js"),
	Pan: require("./Pan.js"),
	PickChannel: require("./PickChannel.js"),
	PolarityInvert: require("./PolarityInvert.js"),
	Pow: require("./Pow.js"),
	Ramp: require("./Ramp.js"),
	ReadBackDelay: require("./ReadBackDelay.js"),
	Repeater: require("./Repeater.js"),
	Rescale: require("./Rescale.js"),
	Retriggerer: require("./Retriggerer.js"),
	SampleRateRedux: require("./SampleRateRedux.js"),
	SecondsToSamples: require("./SecondsToSamples.js"),
	SemitoneToRatio: require("./SemitoneToRatio.js"),
	Shape: require("./Shape/index.js"),
	SignalCombiner: require("./SignalCombiner.js"),
	SporadicRetriggerer: require("./SporadicRetrigger.js"),
	Subtract: require("./Subtract.js"),
	Sum: require("./Sum.js"),
	Timer: require("./Timer.js"),
	VectorMagnitude: require("./VectorMagnitude.js"),
	Augment: require("./spectral/Augment.js"),
	BinShift: require("./spectral/BinShift.js"),
	FFT: require("./spectral/FFT.js"),
	HardHighPass: require("./spectral/HardHighPass.js"),
	HardLowPass: require("./spectral/HardLowPass.js"),
	Hopper: require("./spectral/Hopper.js"),
	IFFT: require("./spectral/IFFT.js"),
	ReChunk: require("./spectral/ReChunk.js"),
	SpectralGate: require("./spectral/SpectralGate.js"),
	SpectralSum: require("./spectral/SpectralSum.js"),
	SpectralUnit: require("./spectral/SpectralUnit.js"),
	UnHopper: require("./spectral/UnHopper.js"),
	Windower: require("./spectral/Windower.js"),
	CircularMotion: require("./vector/CircularMotion.js"),
	LinearMotion: require("./vector/LinearMotion.js")
}
},{"./AHD.js":111,"./Abs.js":112,"./AllPass.js":113,"./CircleBufferNode.js":114,"./CircleBufferReader.js":115,"./CircleBufferWriter.js":116,"./Clip.js":117,"./CombFilter.js":118,"./ConcatChannels.js":119,"./CrossFader.js":120,"./DecibelToScaler.js":121,"./Delay.js":122,"./Divide.js":123,"./Filter.js":124,"./FixedDelay.js":125,"./FixedMultiply.js":126,"./Gain.js":127,"./GreaterThan.js":128,"./HardClipAbove.js":129,"./HardClipBelow.js":130,"./LessThan.js":131,"./MidiToFrequency.js":132,"./Monitor.js":133,"./MonoDelay.js":134,"./Multiply.js":135,"./Noise.js":136,"./Osc/MultiChannelOsc.js":137,"./Osc/Osc.js":138,"./Pan.js":141,"./PickChannel.js":142,"./PolarityInvert.js":143,"./Pow.js":144,"./Ramp.js":145,"./ReadBackDelay.js":146,"./Repeater.js":147,"./Rescale.js":148,"./Retriggerer.js":149,"./SampleRateRedux.js":150,"./SecondsToSamples.js":151,"./SemitoneToRatio.js":152,"./Shape/index.js":153,"./SignalCombiner.js":155,"./SporadicRetrigger.js":156,"./Subtract.js":157,"./Sum.js":158,"./Timer.js":159,"./VectorMagnitude.js":160,"./spectral/Augment.js":162,"./spectral/BinShift.js":163,"./spectral/FFT.js":164,"./spectral/HardHighPass.js":165,"./spectral/HardLowPass.js":166,"./spectral/Hopper.js":167,"./spectral/IFFT.js":168,"./spectral/ReChunk.js":169,"./spectral/SpectralGate.js":170,"./spectral/SpectralSum.js":171,"./spectral/SpectralUnit.js":172,"./spectral/UnHopper.js":173,"./spectral/Windower.js":174,"./vector/CircularMotion.js":175,"./vector/LinearMotion.js":176}],162:[function(require,module,exports){
const SpectralUnit = require("./SpectralUnit.js")

class Augment extends SpectralUnit {
  constructor(incrementMapping={1:1}, windowSize, hopInterval) {
    super()

    this.addSpectralInlet("in")
    this.addSpectralOutlet("out")

    this.incrementMapping = incrementMapping
  }

  _tick() {
    for(var c=0; c<this.in.length; c++) {
      var out = this.out[c] = this.out[c] || new Array(this.frameSize)
      out.fill(0)
      for(var bin=0; bin<this.windowSize; bin++) {
        for(var i in this.incrementMapping) {
          var bin2 = Math.round(bin*parseFloat(i))*2
          if(bin2 < 0 || bin2 >= this.frameSize)
            continue
          out[bin2] += this.in[c][bin*2] * this.incrementMapping[i]
          out[bin2+1] += this.in[c][bin*2+1] * this.incrementMapping[i]
        }
      }
    }
  }
}
module.exports = Augment

},{"./SpectralUnit.js":172}],163:[function(require,module,exports){
const SpectralUnit = require("./SpectralUnit.js")

class BinShift extends SpectralUnit {
  constructor(shift) {
    super()

    this.addSpectralInlet("in")
    this.addInlet("shift", {mono: true})
    this.addSpectralOutlet("out")

    this.SHIFT = shift || 0
  }

  _tick() {
    var shift = Math.round(this.shift[0]) * 2
    for(var c in this.in) {
      var out = this.out[c] = this.out[c] || new Array(this.frameSize).fill(0)
      out.fill(0)
      for(var bin=1; bin<this.frameSize && bin+shift < this.frameSize; bin+=2) {
        if(bin+shift < 0)
          continue
        out[bin+shift] = this.in[c][bin]
        out[bin+shift-1] = this.in[c][bin-1]
      }
    }
  }
}
module.exports = BinShift

},{"./SpectralUnit.js":172}],164:[function(require,module,exports){
const Unit = require("../../Unit.js")
const FFTjs = require("fft.js")

class FFT extends Unit {
  constructor(windowSize, hopSize) {
    super()
    if(!windowSize)
      throw "FFT expects window size"

    this.windowSize = windowSize
    this.frameSize = this.windowSize * 2

    this.tickInterval = hopSize
    this.addInlet("in", {chunkSize:windowSize})
    this.addOutlet("out", {chunkSize: this.frameSize, type:"spectral"})
    this.fft = new FFTjs(this.windowSize)
  }

  _tick() {
    for(var c in this.in) {
      this.out[c] = this.out[c] || new Array(this.windowSize*2)
      this.fft.realTransform(this.out[c], this.in[c])
      this.fft.completeSpectrum(this.out[c])
    }
  }
}
module.exports = FFT

},{"../../Unit.js":109,"fft.js":262}],165:[function(require,module,exports){
/*
  Spectrally implemented high pass filter.
*/

const SpectralUnit = require("./SpectralUnit.js")

class HardHighPass extends SpectralUnit {
  constructor(f) {
    super()

    this.addSpectralInlet("in")
    this.addInlet("f", {mono:true, type:"frequency"})
    this.addSpectralOutlet("out")

    this.fPerBin = this.sampleRate/this.windowSize

    this.F = f
  }

  _tick() {
    var cutOff = Math.round(this.f[0] / this.fPerBin)*2

    for(var c=0; c<this.in.length; c++) {
      this.out[c] = this.out[c] || new Array(this.frameSize)

      for(var i=0; i<cutOff && i<this.frameSize; i++)
        this.out[c][i] = 0
      for(var i=cutOff; i<this.frameSize; i++)
        this.out[c][i] = this.in[c][i]
    }
  }
}
module.exports = HardHighPass

},{"./SpectralUnit.js":172}],166:[function(require,module,exports){
/*
  Spectrally implemented low pass filter.
*/

const SpectralUnit = require("./SpectralUnit.js")

class HardLowPass extends SpectralUnit {
  constructor(f) {
    super()

    this.addSpectralInlet("in")
    this.addInlet("f", {mono:true, type:"frequency"})
    this.addSpectralOutlet("out")

    this.fPerBin = this.sampleRate/this.windowSize

    this.F = f
  }

  _tick() {
    var cutOff = Math.round(this.f[0] / this.fPerBin)*2

    for(var c=0; c<this.in.length; c++) {
      this.out[c] = this.out[c] || new Array(this.frameSize)

      for(var i=0; i<cutOff && i<this.frameSize; i++)
        this.out[c][i] = this.in[c][i]
      for(var i=cutOff; i<this.frameSize; i++)
        this.out[c][i] = 0
    }
  }
}
module.exports = HardLowPass

},{"./SpectralUnit.js":172}],167:[function(require,module,exports){
const Unit = require("../../Unit.js")
const gcd = require("compute-gcd")

class Hopper extends Unit {
  constructor(hopSize, frameSize) {
    super();
    this.addInlet("in")
    this.addOutlet("out", {chunkSize: frameSize})

    this.hopSize = hopSize
    this.frameSize = frameSize

    this.buffer = [] // multiple circular buffers
    this.t = 0
    this.tickInterval = gcd(hopSize, this.IN.chunkSize)
  }

  _tick() {
    // copy input to the circular buffer
    for(var c=0; c<this.in.length; c++) {
      var buffer = this.buffer[c] = this.buffer[c] || new Array(this.frameSize).fill(0)
      for(var t=0; t<this.tickInterval; t++)
        buffer[(this.t+t)%this.frameSize] = this.in[c][(this.t + t)%this.in[c].length]
    }

    //increment this.t
    this.t += this.tickInterval

    if(this.t%this.hopSize == 0)
      // copy output from circular buffer to output
      for(var c=0; c<this.buffer.length; c++) {
        var out = this.out[c] = this.out[c] || new Array(this.frameSize)
        var buffer = this.buffer[c]
        for(var t=0; t<this.frameSize; t++)
          out[t] = buffer[(t + this.t)%this.frameSize]
      }
  }
}
module.exports = Hopper

},{"../../Unit.js":109,"compute-gcd":96}],168:[function(require,module,exports){
const Unit = require("../../Unit.js")
const FFTjs = require("fft.js")

class IFFT extends Unit {
  constructor(windowSize, hopSize) {
    super()
    if(!windowSize)
      throw "IFFT constructor requires argument: windowSize"

    this.windowSize = windowSize
    this.frameSize = windowSize * 2
    this.fft = new FFTjs(this.windowSize)
    this.complexOut = new Array(this.frameSize) // buffer to  temporarily store complex output of ifft

    this.tickInterval = hopSize

    this.addInlet("in", {type:"spectral", chunkSize: this.frameSize})
    this.addOutlet("out", {chunkSize: this.windowSize})
  }

  _tick() {
    for(var c in this.in) {
      // make output buffer for channel if does not exist
      this.out[c] = this.out[c] || new Array(this.windowSize)

      // perform ifft
      this.fft.inverseTransform(this.complexOut, this.in[c])

      // discard imaginary part of the signal
      for(var t=0; t<this.out[c].length; t++)
        this.out[c][t] = this.complexOut[t*2]
    }
  }
}
module.exports = IFFT

},{"../../Unit.js":109,"fft.js":262}],169:[function(require,module,exports){
const Unit = require("../../Unit.js")
const gcd = require("compute-gcd")
const lcm = require("compute-lcm")

class ReChunk extends Unit {
  constructor(inputInterval, outputInterval) {
    super()
    if(!inputInterval || !outputInterval)
      throw "ReChunk expects 2 numeric contructor arguments"

    this.inputInterval = inputInterval
    this.outputInterval = outputInterval

    this.addInlet("in", {chunkSize: this.inputInterval})
    this.addOutlet("out", {chunkSize: this.outputInterval})
    console.log(this.inputInterval, this.outputInterval)
    this.tickInterval = gcd(this.inputInterval, this.outputInterval)

    this.bufferSize = lcm(this.inputInterval, this.outputInterval)
    //                  ^ is this correct??

    this.buffer = [] // multichanel circular internal buffer
    this.t = 0
  }

  _tick() {
    // copy input to internal buffer (if appropriate)
    if(this.t%this.inputInterval == 0)
      for(var c=0; c<this.in.length; c++) {
        var buffer = this.buffer[c] = this.buffer[c] || new Array(this.bufferSize).fill(0)
        for(var t=0; t<this.inputInterval; t++)
          buffer[(this.t+t)%buffer.length] = this.in[c][t]
      }

    // increment t
    this.t += this.tickInterval

    // copy internal buffer to output (if appropriate)
    if(this.t%this.outputInterval == 0) {
      var t0 = this.t-this.outputInterval
      for(var c=0; c<this.buffer.length; c++) {
        var out = this.out[c] = this.out[c] || new Array(this.outputInterval)
        var buffer = this.buffer[c]
        for(var t=0; t<this.outputInterval; t++)
          out[t] = buffer[(t0+t)%buffer.length]
      }
    }


  }
}
module.exports = ReChunk

},{"../../Unit.js":109,"compute-gcd":96,"compute-lcm":97}],170:[function(require,module,exports){
const SpectralUnit = require("./SpectralUnit.js")

class SpectralGate extends SpectralUnit {
  constructor(threshold) {
    super()
    this.addSpectralInlet("in")
    this.addInlet("threshold", {mono: true})
    this.addSpectralOutlet("out",)

    this.invert = true

    this.THRESHOLD = threshold || 0.5
  }

  _tick() {
    var threshold = this.threshold[0]
    for(var c in this.in) {
      var out = this.out[c] = this.out[c] || new Array(this.frameSize)
      for(var bin=0; bin<this.frameSize; bin+=2) {
        var re = this.in[c][bin]
        var im = this.in[c][bin+1]
        var mag = Math.sqrt(re*re + im*im)
        if(this.invert ? mag < threshold : mag > threshold) {
          out[bin] = re
          out[bin+1] = im
        } else {
          out[bin] = 0
          out[bin+1] = 0
        }
      }
    }
  }
}
module.exports = SpectralGate

},{"./SpectralUnit.js":172}],171:[function(require,module,exports){
const SpectralUnit = require("./SpectralUnit.js")

class SpectralSum extends SpectralUnit {
  constructor(a, b, windowSize, hopInterval) {
    super()

    this.addSpectralInlet("a")
    this.addSpectralInlet("b")
    this.addSpectralOutlet("out")

    this.A = a
    this.B = b
  }

  _tick() {
    var numberOfChannels = Math.max(this.a.length, this.b.length)
    for(var c=0; c<numberOfChannels; c++) {
      var a = this.a[c%this.a.length]
      var b = this.b[c%this.b.length]
      var out = this.out[c] = this.out[c] || new Array(this.frameSize)
      for(var bin=0; bin<this.frameSize; bin++)
        out[bin] = a[bin] + b[bin]
    }
  }
}
module.exports = SpectralSum

},{"./SpectralUnit.js":172}],172:[function(require,module,exports){
/*
  A base class for unit which process spectral data.
*/

const Unit = require("../../Unit.js")
const config = require("../../config")

class SpectralUnit extends Unit {
  constructor() {
    super()

    this.windowSize = config.fft.windowSize
    this.frameSize = this.windowSize * 2
    this.hopInterval = config.fft.hopSize
    this.tickInterval = this.hopInterval
  }

  addSpectralInlet(name, options={}) {
    options = Object.assign({}, options, {
      type: "spectral",
      chunkSize: this.frameSize,
    })
    this.addInlet(name, options)
  }
  addSpectralOutlet(name, options={}) {
    options = Object.assign({}, options, {
      type: "spectral",
      chunkSize: this.frameSize,
    })
    this.addOutlet(name, options)
  }
}
SpectralUnit.prototype.isSpectralUnit = true
module.exports = SpectralUnit

},{"../../Unit.js":109,"../../config":177}],173:[function(require,module,exports){
const Unit = require("../../Unit.js")

class UnHopper extends Unit {
  constructor(hopSize, windowSize) {
    super()

    this.windowSize = windowSize
    this.hopSize = hopSize

    this.tickInterval = hopSize

    this.addInlet("in", {chunkSize: this.windowSize})
    this.addOutlet("out", {chunkSize: this.hopSize})

    this.buffer = [] // multichannel circular buffer
    this.t = 0
  }

  _tick() {
    // mix input to buffer
    for(var c=0; c<this.in.length; c++) {
      var buffer = this.buffer[c] = this.buffer[c] || new Array(this.windowSize).fill(0)
      for(var t=0; t<this.windowSize; t++) {
        buffer[(t+this.t)%buffer.length] += this.in[c][t]
      }
    }
    this.t += this.hopSize

    // copy from buffer to output
    if(this.t > this.hopSize) {
      var t0 = (this.t-this.hopSize)
      var tBuffer
      for(var c=0; c<this.buffer.length; c++) {
        var out = this.out[c] = this.out[c] || new Array(this.hopSize)
        var buffer = this.buffer[c]
        for(var t=0; t<this.hopSize; t++) {
          tBuffer = (t0+t)%buffer.length
          out[t] = buffer[tBuffer]
          // wipe copied part of the buffer
          buffer[tBuffer] = 0
        }
      }
    }
  }
}
module.exports = UnHopper

},{"../../Unit.js":109}],174:[function(require,module,exports){
const Unit = require("../../Unit.js")

class Windower extends Unit {
  constructor(windowSize /*in samples*/, kind="hamming", hopSize) {
    super()
    if(!windowSize)
      throw "Windower constructor expects a windowSize"
    this.addInlet("in", {chunkSize:windowSize})
    this.addOutlet("out", {chunkSize: windowSize})
    this.tickInterval = hopSize

    this.windowSize = windowSize
    this.windowKind = kind
    this.envelopeBuffer = Windower.getEnvelope(windowSize, kind)
  }

  _tick() {
    for(var c=0; c<this.in.length; c++) {
      var out = this.out[c] = this.out[c] || new Array(this.windowSize)
      for(var t=0; t<this.windowSize; t++)
        out[t] = this.in[c][t] * this.envelopeBuffer[t]
    }
  }
}
module.exports = Windower

Windower.envelopes = {}
Windower.envelopeFunctions = {
  "hamming": (n, N) => {
    return Math.pow( Math.sin((Math.PI * n) / (N-1)) , 2 )
  }
}
Windower.windowSpectrums = {}
function getEnvelope(size, type) {
  var F = Windower.envelopeFunctions[type]
  if(!F)
    throw "Window type \'"+type+"\' is not defined."
  var name = type + size
  if(Windower.envelopes[name])
    return Windower.envelopes[name]

  var env = new Float32Array(size)
  for(var n=0; n<size; n++)
    env[n] = F(n, size)

  Windower.envelopes[name] = env
  return env
}
Windower.getEnvelope = getEnvelope

},{"../../Unit.js":109}],175:[function(require,module,exports){
const Unit = require("../../Unit.js")
const config = require('../../config.js')

const phiOverSampleRate = 2*Math.PI/config.sampleRate

function CircularMotion(f, r, centre) {
  Unit.call(this)
  this.addInlet("f", {mono: true})
  this.addInlet("radius", {mono: true})
  this.addInlet("centre", 2)
  this.addOutlet("out", 2)

  this.phase = 0
  this.F = f || 1
  this.RADIUS = r || 1
  this.CENTRE = centre || [0, 0]
}
CircularMotion.prototype = Object.create(Unit.prototype)
CircularMotion.prototype.constructor = CircularMotion
module.exports = CircularMotion

CircularMotion.prototype._tick = function() {
  for(var t=0; t<this.f.length; t++) {
    this.phase += this.f[t] * phiOverSampleRate
    this.out[0][t] = Math.sin(this.phase) * this.radius[t] + this.centre[0][t]
    this.out[1][t] = Math.cos(this.phase) * this.radius[t] + this.centre[1][t]
  }
}

CircularMotion.random = function(fMax, rMax, oMax) {
  var circ = new RotatingAmbient(
    Math.random() * (fMax || 2),
    Math.random() * (rMax || 5),
    [
      (Math.random()*2-1) * (oMax || 5),
      (Math.random()*2-1) * (oMax || 5),
    ],
  )
  circ.phase = Math.random()*2*Math.PI
  return circ
}

},{"../../Unit.js":109,"../../config.js":177}],176:[function(require,module,exports){
const Unit = require("../../Unit.js")
const config = require("../../config.js")

function LinearMotion(a, b, duration) {
  Unit.call(this)

  this.addInlet("a")
  this.addInlet("b")
  this.addInlet("duration", {mono: true})
  this.addOutlet("out")

  this.A = a || [0,0]
  this.B = b || [0,0]
  this.DURATION = duration || 1

  this.progress = 0
  this.playing = true
}
LinearMotion.prototype = Object.create(Unit.prototype)
LinearMotion.prototype.constructor = LinearMotion
module.exports = LinearMotion

LinearMotion.random = function(maxSize, maxDuration) {
  maxSize = maxSize || 10
  maxDuration = maxDuration || 10
  var motion = new LinearMotion(
    [
      (Math.random()*2-1) * maxSize,
      (Math.random()*2-1) * maxSize,
    ],
    [
      (Math.random()*2-1) * maxSize,
      (Math.random()*2-1) * maxSize,
    ],
    Math.random() * maxDuration,
  )
  return motion
}

LinearMotion.prototype._tick = function() {
  var chunkSize = this.OUT.chunkSize

  var progress = new Float32Array(chunkSize)

  for(var t=0; t<chunkSize; t++) {
    if(this.playing && this.progress>=0 && this.progress<1)
      this.progress += config.sampleInterval / this.duration[t]
    progress[t] = this.progress
  }

  for(var c=0; c<this.a.length || c<this.b.length; c++) {
    var out = this.out[c] = this.out[c] || new Float32Array(chunkSize)
    var a = this.a[c] || new Float32Array(chunkSize)
    var b = this.b[c] || new Flaot32Array(chunkSize)
    for(var t=0; t<chunkSize; t++)
      out[t] = a[t] * (1-progress[t]) + b[t] * progress[t]
  }
}

},{"../../Unit.js":109,"../../config.js":177}],177:[function(require,module,exports){
(function (process){
const argv = require("minimist")(process.argv.slice(2))

var localConfig = {}

Object.assign(localConfig, {
  standardChunkSize: 32, // if < 256, Web Audio API will prang out
  sampleRate: 44100,
  channelFormat: "stereo",

  fft: {
    windowSize: 4096,
    hopSize: 4096/4,
    windowKind: "hamming",
  },

  useDuspShorthands: true,
}, argv)


localConfig.sampleInterval = 1/module.exports.sampleRate

module.exports = localConfig

}).call(this,require('_process'))
},{"_process":370,"minimist":269}],178:[function(require,module,exports){
function constructExpression(o, index, destinations) {
  if(o.constructor == String)
    o = parseExpression(o, index)
  if(o.constructor == String)
    throw "Can't construct expression: " + o

  switch(o.type) {
    case "object":
      return constructObject(o, index)
    case "number":
      return constructNumber(o, index)

    case "id":
      return constructObjectReference(o, index)

    case "operation":
      return constructOperation(o, index, destinations)

    case "objectProperty":
      return constructObjectProperty(o, index)

    case "shorthand":
      return constructShorthand(o, index)

    case "unnamedArgument":
      return constructExpression(o.value, index)

    case "string":
      return constructString(o, index)

    case "json":
      return o.o

    default:
      throw "Unknown expression type: " + o.type
  }
}

module.exports = constructExpression
const parseExpression = require("../parseDSP/getExpression.js")
const constructObject = require("./constructObject")
const constructNumber = require("./constructNumber")
const constructObjectReference = require("./constructObjectReference")
const constructOperation = require("./constructOperation")
const constructObjectProperty = require("./constructObjectProperty")
const constructShorthand = require("./constructShorthand")
const constructString = require("./constructString")

},{"../parseDSP/getExpression.js":196,"./constructNumber":179,"./constructObject":180,"./constructObjectProperty":181,"./constructObjectReference":182,"./constructOperation":183,"./constructShorthand":184,"./constructString":185}],179:[function(require,module,exports){
function constructNumber(o) {
  if(o.constructor == String)
    o = parseNumber(o)

  if(o.type != "number")
    return null

  return o.n
}

module.exports = constructNumber
const parseNumber = require("../parseDSP/getNumber.js")

},{"../parseDSP/getNumber.js":206}],180:[function(require,module,exports){


function constructObject(o, index) {
  index = index || {}
  if(o.constructor == String)
    o = parseObject(o)

  if(o.type != "object")
    return null

  var constructor = components[o.constructor]
  if(!constructor)
    throw "Unknown object constructor: "+o.constructor
  var args = o.arguments.map(constructExpression)

  /*var obj = Object.create(constructor.prototype)
  constructor.apply(obj, args)*/
  var obj = new constructor(...args)
  if(o.id)
    obj.label = o.id

  let idTag = '#'+obj.label
  if(index[idTag]) {
    if(index[idTag] != obj)
      throw "Duplicate objects for id:", obj.label
  } else
    index[idTag] = obj

  for(var i in o.attributes) {
    var arg = o.attributes[i]
    var property = arg.property
    var upperCaseProperty = property.toUpperCase()
    if(obj[upperCaseProperty] && obj[upperCaseProperty].isInlet)
      property = upperCaseProperty
    if(arg.type == "attribute")
      obj[property] = constructExpression(arg.value, index)
    else
      throw "unknown argument type: ", arg.type
  }

  if(obj.dusp && obj.dusp.flagFunctions)
    for(var i in o.flags) {
      var flag = o.flags[i].flag
      var func = obj.dusp.flagFunctions[flag]
      if(func)
        func.call(obj)
    }




  return obj
}

module.exports = constructObject
const parseObject = require("../parseDSP/getObject.js")
const components = require("../patchesAndComponents")
const constructExpression = require("./constructExpression")

},{"../parseDSP/getObject.js":207,"../patchesAndComponents":253,"./constructExpression":178}],181:[function(require,module,exports){
function constructObjectProperty(o, index) {
  var obj = constructExpression(o.object, index)
  return obj[o.property]
}

module.exports = constructObjectProperty
const constructExpression = require("./constructExpression")

},{"./constructExpression":178}],182:[function(require,module,exports){
function constructObjectReference(o, index) {
  if(o.constructor == String)
    o = parseObjectReference(o)

  let hashTag = '#'+o.id
  if(index[hashTag])
    return index[hashTag]
  else
    throw "Error: Referencing an object which has not been declared: #"+o.id
}
module.exports = constructObjectReference

const parseObjectReference = require("../parseDSP/getObjectReference.js")

},{"../parseDSP/getObjectReference.js":209}],183:[function(require,module,exports){
function constructOperation(o, index, destinations) {
  if(!o.a || !o.b || !o.operator)
    throw "could not construct operation"

  var a = constructExpression(o.a, index)
  var b = constructExpression(o.b, index)

  switch(o.operator) {
    case "*":
      return quick.multiply(a, b)
    case "/":
      return quick.divide(a, b)
    case "+":
      return quick.add(a, b)
    case "-":
      return quick.subtract(a, b)
    case ",":
      return quick.concat(a, b)
    case "@":
      return new components.Pan(a, b)
    case "^":
      return quick.pow(a, b)
    case "->":
      if(b.isUnitOrPatch) {
        b.defaultInlet.set(a)
        return b
      } else
        throw "unknown use of -> operator"

    case "|<":
      return quick.clipBelow(b, a)

    case ">|":
      return quick.clipAbove(a, b)

    case "for":
      if(a.constructor == Number)
        a = new Repeater(a)
      if(a.scheduleFinish)
        a.scheduleFinish(b)
      else
        throw "invalid use of 'for' operator. First operand has no scheduleFinish function"
      return a

    case "then":
      var out
      if(!destinations || !destinations.length) {
        out = new Repeater
        out.IN = a
        destinations = [(x) => {
          out.IN = x
        }]
      }
      a.onFinish = () => {
        for(var i in destinations)
          destinations[i](b)
      }
      if(out)
        return out
      else
        return a

    case "at":
      if(!a.stop || !a.trigger)
        throw "invalid use of 'at' operator"
      a.stop()
      //a.trigger()
      a.scheduleTrigger(b)
      return a

    case "!": // regular retrigger
      if(!a.stop || !a.trigger)
        throw "invalid use of '!' operator"
      a.trigger()
      new components.Retriggerer(a, b)
      return a

    case "~!": // SporadicRetriggerer
      if(!a.stop || !a.trigger)
        throw "invalide use of '!~' operator"
      new components.SporadicRetriggerer(a, b)
      return a

    default:
      throw "Unknown operator: " + o.operator;
  }
}

module.exports = constructOperation
const quick = require("../quick")
const constructExpression = require("./constructExpression")
const components = require("../components")
const Repeater = require("../components/Repeater.js")

},{"../components":161,"../components/Repeater.js":147,"../quick":254,"./constructExpression":178}],184:[function(require,module,exports){
function constructShorthand(o, index) {
  if(o.constructor == String)
    o = parseShorthand(o)

  var args = o.arguments.map(constructNumber)

  var constructor = shorthandConstructors[o.constructorAlias]
  if(constructor)
    return constructor.apply(null, args)

  constructor = components[o.constructorAlias]
  if(constructor) {
    return new constructor(...args)
  }

  throw "Unknown shorthand: " + o.constructorAlias
}

module.exports = constructShorthand
const components = require("../patchesAndComponents")
const parseShorthand = require("../parseDSP/getShorthand.js")
const constructNumber = require("./constructNumber")
const shorthandConstructors = require("./shorthandConstructors")

},{"../parseDSP/getShorthand.js":212,"../patchesAndComponents":253,"./constructNumber":179,"./shorthandConstructors":186}],185:[function(require,module,exports){
function constructString(o, index) {
  if(o.constructor == String)
    o = parseString(o)
  if(!o)
    return null

  if(o.type == "string")
    return o.string

  return null
}

module.exports = constructString
const parseString = require("../parseDSP/getString.js")

},{"../parseDSP/getString.js":214}],186:[function(require,module,exports){
const components = require("../components")

module.exports = {
  O: function(frequency) {
    return new components.Osc(frequency)
  },

  Z: function(frequency) {
    var osc = new components.Osc(frequency)
    osc.waveform = "saw"
    return osc
  },
  Sq: function(frequency) {
    var osc = new components.Osc(frequency)
    osc.waveform = "square"
    return osc
  },

  A: function(time) {
    return new components.Shape("attack", time).trigger()
  },
  D: function(time) {
    return new components.Shape("decay", time).trigger()
  },

  t: function() {
    return new components.Timer()
  },

  LP: function(freq) {
    return new components.Filter(null, freq)
  },

  HP: function(freq) {
    console.log('woo')
    return new components.Filter(null, freq, "HP")
  },

  AP: function(delaytime, feedback) {
    return new components.AllPass(delaytime, feedback)
  },

  random: function() {
    return Math.random()
  },
}

},{"../components":161}],187:[function(require,module,exports){
// reduce things to dusp
const config = require("./config.js")

function dusp(o, index) {
  index = index || {}

  if(o === undefined)
    return undefined
  if(o === null)
    return null

  if(o === 0 || (o && o.constructor == Number))
    return o

  if(o && o.constructor == String)
    return duspString(o)

  if(o.isUnit) {
    // return a dusp representation of the unit
    if(index[o.label])
      return "#" + o.label
    else {
      index[o.label] = o

      if(config.useDuspShorthands) {
        var outputUnits = o.outputUnits
        var useShorthand = o.numberOfOutgoingConnections <= 1
        /*for(var i in outputUnits) {
          console.log("label:", outputUnits[i].label)
          if(!index[outputUnits[i].label]) {
            useShorthand = false
            break
          }
        }*/
      } else
        var useShorthand = false

      if(useShorthand)
        if(o.dusp && o.dusp.shorthand) {
          var possibleShorthand = o.dusp.shorthand.call(o, index)
          if(possibleShorthand)
            return possibleShorthand
        }

      var args = [o.constructor.name,]

      if(!useShorthand) {
        args.push("#" + o.label)
      }

      for(var i in o.inlets) {
        if(o.inlets[i].outlet)
          var value = duspOutlet(o.inlets[i].outlet, index)
        else
          var value = o.inlets[i].constant
        var attr = i.toUpperCase() + ":" + value
        args.push(attr)
      }

      if(o.dusp) {
        if(o.dusp.extraProperties)
          if(o.dusp.extraProperties.constructor == Array)
            for(var i in o.dusp.extraProperties) {
              var prop = o.dusp.extraProperties[i]
              args.push(prop + ":" + dusp(o[prop]))
            }
          else if(o.dusp.extraProperties.constructor == Object)
            for(var prop in o.dusp.extraProperties)
              if(o[prop] != o.dusp.extraProperties[prop])
                args.push(prop + ":" + dusp(o[prop]))


        if(o.dusp.extraArgs) {
          var extraArgs = o.dusp.extraArgs.call(o)
          if(extraArgs)
            args = args.concat(extraArgs)
        }
      }

      return "[" + args.join(" ") + "]"
    }
  }

  if(o.isOutlet)
    return duspOutlet(o, index)

  if(o.isInlet)
    return duspInlet(o, index)

  console.log(o.label)
  console.warn("unable to turn object to dusp: " + o)
  return null
}

module.exports = dusp
dusp.usingShorthands = config.useDuspShorthands

function duspOutlet(o, index) {
  if(o == o.unit.defaultOutlet)
    return dusp(o.unit, index)

  var obdusp = dusp(o.unit, index)
  return obdusp + "." + o.name.toUpperCase()
}

function duspInlet(inlet, index) {
  if(inlet.connected)
    return dusp(inlet.outlet, index)
  else {
    if(inlet.constant.constructor == Number)
      return inlet.constant
    if(inlet.constant.constructor == Array)
      return "(" + inlet.constant.join(",") + ")"
    else throw "strange constant: " + inlet.constant
  }
}

function duspString(str, index) {
  return "\"" + str + "\""
}

},{"./config.js":177}],188:[function(require,module,exports){
function* exploreConnections(...list) {
  // explore a circuit, yielding every new object found
  for(let i=0; i<list.length; i++) {
    let unit = list[i]
    if(unit.isPatch) {
      list.push(...unit.units)
      continue
    }
    yield unit

    list.push(...unit.neighbours.filter(u => !list.includes(u)))
  }
}
module.exports = exploreConnections

function exploreAndList(...startingPoints) {
  let list = []
  for(let unit of exploreConnections(...startingPoints))
    list.push(unit)

  return list
}
module.exports.all = exploreAndList

function checkConnection(unit, ...set) {
  // return true if the unit connected to any units in the set
  for(let u of exploreConnections(unit))
    if(set.includes(u))
      return true

  // if iterator ends then there is no connection
  return false
}
module.exports.checkConnection = checkConnection

},{}],189:[function(require,module,exports){

/**
 * Root class for DUSP
 */
module.exports = {

  // useful functions
  unDusp: require('./unDusp'),
  dusp: require('./dusp'),
  renderChannelData: require("./renderChannelData"),
  renderAudioBuffer: require("./webaudioapi/renderAudioBuffer"),
  channelDataToAudioBuffer: require('./webaudioapi/channelDataToAudioBuffer'),
  connectToWAA: require("./webaudioapi/connectToWAA"),

  quick: require('./quick'),

  // basic elements
  Unit: require("./Unit"),
  Patch: require("./Patch"),
  Circuit: require("./Circuit"),

  components: require('./components'),
  patches: require('./patches'),

  // htmlInterface
  DuspPlayer: require('./webaudioapi/DuspPlayer')
}

},{"./Circuit":100,"./Patch":105,"./Unit":109,"./components":161,"./dusp":187,"./patches":252,"./quick":254,"./renderChannelData":255,"./unDusp":256,"./webaudioapi/DuspPlayer":257,"./webaudioapi/channelDataToAudioBuffer":258,"./webaudioapi/connectToWAA":259,"./webaudioapi/renderAudioBuffer":260}],190:[function(require,module,exports){
module.exports = {
  operators: [
    "->", // connect
    "at",
    "^",
    "*",
    "/",
    "@",
    "+",
    "-",
    "~!",
    "!",
    ",", // concat
    "->", // connect
    ">|",
    "|<",
    "for",
    "then",
  ], // the order of this list determines binding order
  units: [
    "s", "ms",
    "Hz",
  ],

  shorthandConstructors: ["O", "Z", "Sq", "A", "D", "t", "random", "LP", "AP", "HP"]
}

const components = require("../patchesAndComponents")
for(var constr in components)
  module.exports.shorthandConstructors.push(constr)

},{"../patchesAndComponents":253}],191:[function(require,module,exports){
const whitespaceRegex = /\s/
function countWhitespace(str, i0) {
  i0 = i0 || 0

  for(var i=i0; i<str.length; i++)
    if(whitespaceRegex.test(str[i]))
      continue
    else
      return i-i0
}
module.exports = countWhitespace

},{}],192:[function(require,module,exports){
function findCoordinate(str, point) {
  var col = 0
  var row = 0
  for(var i=0; i<point; i++) {
    col++
    if(str[i] == "\n")  {
      row++
      col=0
    }
  }

  return [row, col]
}
module.exports = findCoordinate

},{}],193:[function(require,module,exports){
function getArgument(str, i0) {
  var id = getObjectReference(str, i0)
  if(id) return id

  var attr = getAttribute(str, i0)
  if(attr)
    return attr

  var arg = getExpression(str, i0)
  if(arg)
    return {
      type: "unnamedArgument",
      value: arg,
      length: arg.length,
    }

  var flag = getWord(str, i0)
  if(flag)
    return {
      type:"flag",
      flag: flag,
      length: flag.length,
    }

  return null
}

module.exports = getArgument
const getObjectReference = require("./getObjectReference.js")
const getAttribute = require("./getAttribute")
const getWord = require("./getWord.js")
const getExpression = require("./getExpression")

},{"./getAttribute":194,"./getExpression":196,"./getObjectReference.js":209,"./getWord.js":216}],194:[function(require,module,exports){
const getWord = require("./getWord.js")
const countWhitespace = require("./countWhitespace")

function getAttribute(str, i0) {
  i0 = i0 || 0

  var property = getWord(str, i0)
  if(!property)
    return null

  var i1 = i0 + property.length + countWhitespace(str, i0 + property.length)

  if(str[i1] != "=" && str[i1] != ":")
    return null
  

  var i2 = i1 + 1 + countWhitespace(str, i1+1)

  var value = getExpression(str, i2)
  if(!value)
    return null

  return {
    type: "attribute",
    property: property,
    value: value,
    "length": i2-i0 + value.length
  }
}
module.exports = getAttribute

const getExpression = require("./getExpression.js")

},{"./countWhitespace":191,"./getExpression.js":196,"./getWord.js":216}],195:[function(require,module,exports){
const skipCommentsAndWhitespace = require("./skipCommentsAndWhitespace")
const getWord = require("./getWord")

function getDotProperty(str, i0) {
  var i1 = skipCommentsAndWhitespace(str, i0)
  if(str[i1] != ".")
    return null
  var i2 = skipCommentsAndWhitespace(str, i1+1)
  var property = getWord(str, i2)
  if(!property)
    return null
  return {
    type: "property",
    property: property,
    "length": i2-i0 + property.length,
  }
}
module.exports = getDotProperty

},{"./getWord":216,"./skipCommentsAndWhitespace":218}],196:[function(require,module,exports){
function getExpression(str, i0) {
  i0 = i0 || 0

  var i1 = skipCommentsAndWhitespace(str, i0)
  /*if(str[i0] == "(") {
    var bracketed = true
    i1++
  } else
    var bracketed = false*/

  var expr0 = getSimpleExpression(str, i1)
  if(expr0 == null)
    return null

  var iN = i1 + expr0.length
  var oList = [expr0]
  while(true) {
    //iN = skipCommentsAndWhitespace(str, iN)
    var op = getOperatorOperand(str, skipCommentsAndWhitespace(str, iN))
    if(op) {
      oList.push(op)
      iN = skipCommentsAndWhitespace(str, iN) + op.length
    } else break
  }

  /*if(bracketed) {
    if(str[iN] == ")")
      iN++
    else
      return null
  }*/

  var length = iN-i0
  for(var i in oList)
    delete oList[i].length

  while(oList.length > 1){
    for(var i=1; i<oList.length; i++){
      if(i == oList.length-1 || oList[i].bindingOrder < oList[i+1].bindingOrder) {
        if(i > 1) {
          oList[i].a = oList[i-1].b
          oList[i-1].b = oList[i]
          oList.splice(i, 1)
          break
        } else {
          oList[i].a = oList[i-1]
          oList[i-1] = oList[i]
          oList.splice(i, 1)
          break
        }
      }
    }
  }

  oList[0].length = length
  return oList[0]
}

function getSimpleExpression(str, startIndex) {
  startIndex = startIndex || 0


  if(str[startIndex] == "{")
    return getJSON(str, startIndex)

  if(str[startIndex] == "(") {
    var i = skipCommentsAndWhitespace(str, startIndex+1)
    var expr = getExpression(str, i)
    if(!expr)
      return null
    i = skipCommentsAndWhitespace(str, i + expr.length)
    if(str[i] != ")")
      return null
    expr.length = i+1-startIndex
    expr.bracketed = true
    return expr
  }

  var ref = getObjectReference(str, startIndex)
  if(ref)
    return ref

  var n = getNumber(str, startIndex)
  if(n)
    return n

  var obj = getObjectOrObjectProperty(str, startIndex)
  if(obj)
    return obj

  var shorthand = getShorthand(str, startIndex)
  if(shorthand)
    return shorthand

  var variable = getVariable(str, startIndex)
  if(variable)
    return variable

  var string = getString(str, startIndex)
  if(string)
    return string

  return null
}

module.exports = getExpression
module.exports.simple = getSimpleExpression
const getObjectOrObjectProperty = require("./getObjectOrObjectProperty")
const getObjectReference = require("./getObjectReference.js")
const getNumber = require("./getNumber.js")
const skipCommentsAndWhitespace = require("./skipCommentsAndWhitespace")
const getOperatorOperand = require("./getOperatorOperand")
const getShorthand = require("./getShorthand")
const getString = require("./getString")
const getJSON = require("./getJSON")
const getVariable = require('./getVariable')

},{"./getJSON":204,"./getNumber.js":206,"./getObjectOrObjectProperty":208,"./getObjectReference.js":209,"./getOperatorOperand":211,"./getShorthand":212,"./getString":214,"./getVariable":215,"./skipCommentsAndWhitespace":218}],197:[function(require,module,exports){
arguments[4][192][0].apply(exports,arguments)
},{"dup":192}],198:[function(require,module,exports){
function getArray(str, i0=0) {
  if(str[i0] != "[")
    return null

  var i = skipWhitespace(str, i0+1)

  var array = []
  while(i<str.length) {
    if(str[i] == "]") {
      i++
      break
    }

    var obj = getJSON(str, i)
    if(!obj)
      return null
    array.push(obj.o)

    i = skipWhitespace(str, i + obj.length)

    if(str[i] == ",") {
      i = skipWhitespace(str, i+1)
      continue
    } else if(str[i] == "]"){
      i++
      break
    } else
      return null
  }

  return {
    type: "json",
    o: array,
    length: i-i0
  }
}

module.exports = getArray
const skipWhitespace = require("./skipWhitespace")
const getJSON = require("./index.js")

},{"./index.js":204,"./skipWhitespace":205}],199:[function(require,module,exports){
const numberRegex = /[0-9.\-]/

function getNumber(str, startIndex=0) {

  for(var i=startIndex; i<=str.length; i++) {
    var c = str[i]
    if(!numberRegex.test(c))
      if(i==startIndex)
        return null
      else
        return {
          type: "number",
          n: parseFloat(str.slice(startIndex, i)),
          "length": i-startIndex,
        }
  }

  console.warn(
    "WARNING: open ended word",
    "\'"+str.slice(startIndex, i)+"\'",
    "at", findCoordinate(str, i)
  )
  return {
    type: "number",
    n: parseFloat(str.slice(startIndex, i)),
    "length": i-startIndex,
  } 
}

module.exports = getNumber
const findCoordinate = require("./findCoordinate")

},{"./findCoordinate":197}],200:[function(require,module,exports){
function getObject(str, i0=0) {
  if(str[i0] != "{")
    return null

  var i = skipWhitespace(str, i0+1)

  var o = {}
  while(i < str.length) {
    if(str[i] == "}") {
      i++
      break
    }
    var property = getProperty(str, i)
    if(!property)
      return null
    o[property.name] = property.value

    i = skipWhitespace(str, i + property.length)

    if(str[i] == ",") {
      i = skipWhitespace(str, i+1)
      continue
    } else if(str[i] == "}") {
      i++
      break
    } else
      return null
  }

  return {
    type: "json",
    o: o,
    length: i-i0,
  }
}

module.exports = getObject
const getProperty = require("./getProperty")
const skipWhitespace = require("./skipWhitespace.js")

},{"./getProperty":201,"./skipWhitespace.js":205}],201:[function(require,module,exports){
function getProperty(str, i0=0) {
  var name = getWord(str, i0) || getString(str, i0) || getNumber(str, i0)
  if(!name)
    return null

  var i = skipWhitespace(str, i0 + name.length)

  if(str[i] == ",")
    return {
      type: "json-property",
      name: name.string || name.n || name,
      value: true,
      length: name.length,
    }

  if(str[i] != ":")
    return null
  else
    i = skipWhitespace(str, i+1)

  var value = getJSON(str, i)
  if(!value)
    return null

  return {
    type: "json-property",
    name: name.string || name,
    value: value.o,
    length: i+value.length - i0
  }
}

module.exports = getProperty
const getWord = require("./getWord.js")
const getString = require("./getString")
const getJSON = require("./index.js")
const skipWhitespace = require("./skipWhitespace")
const getNumber = require("./getNumber")

},{"./getNumber":199,"./getString":202,"./getWord.js":203,"./index.js":204,"./skipWhitespace":205}],202:[function(require,module,exports){
function getString(str, i0=0) {

  if(str[i0] == "\"")
    var endChar = "\""
  else if(str[i0] == "'")
    var endChar = "'"
  else
    return null

  var i1
  do {
    i1 = str.indexOf(endChar, i0+1)
    if(i1 == -1)
      return null
  } while(str[i1-1] == "\\")

  return {
    type: "string",
    string: str.slice(i0+1, i1),
    length: i1-i0+1
  }
}

module.exports = getString

},{}],203:[function(require,module,exports){

const findCoordinate = require("./findCoordinate")
const wordRegex = /[a-zA-Z_]/

function getWord(str, startIndex) {
  startIndex = startIndex || 0

  for(var i=startIndex; i<str.length; i++) {
    var c = str[i]
    if(!wordRegex.test(c))
      if(i==startIndex)
        return null
      else
        return str.slice(startIndex, i)
  }
  console.warn(
    "WARNING: open ended word",
    "\'"+str.slice(startIndex, i)+"\'",
    "at", findCoordinate(str, i)
  )
  return str.slice(startIndex, i)
}
module.exports = getWord

},{"./findCoordinate":197}],204:[function(require,module,exports){
function getJSON(str, i0=0) {
  var string = getString(str, i0)
  if(string)
    return {
      type: "json",
      o: string.string,
      length: string.length
    }

  var number = getNumber(str, i0)
  if(number)
    return {
      type: "json",
      o: number.n,
      length: number.length
    }

  var array = getArray(str, i0)
  if(array)
    return array

  var obj = getObject(str, i0)
  if(obj)
    return obj


  return null
}

module.exports = getJSON
const getString = require("./getString")
const getNumber = require("./getNumber")
const getArray = require("./getArray")
const getObject = require("./getObject")

},{"./getArray":198,"./getNumber":199,"./getObject":200,"./getString":202}],205:[function(require,module,exports){
const whitespaceRegex = /\s/
function skipWhitespace(str, i0) {
  i0 = i0 || 0

  for(var i=i0; i<str.length; i++)
    if(whitespaceRegex.test(str[i]))
      continue
    else
      return i
  return i
}
module.exports = skipWhitespace

},{}],206:[function(require,module,exports){
const numberRegex = /[0-9.\-]/

function getNumber(str, startIndex) {
  startIndex = startIndex || 0

  for(var i=startIndex; i<=str.length; i++) {
    var c = str[i]
    if(!numberRegex.test(c))
      if(i==startIndex)
        return null
      else
        return {
          type: "number",
          n: parseFloat(str.slice(startIndex, i)),
          "length": i-startIndex,
        }
  }
}
module.exports = getNumber

},{}],207:[function(require,module,exports){
function getObject(str, i0) {
  i0 = i0 || 0
  if(str[i0] != "[")
    return null

  var i1 = skipCommentsAndWhitespace(str, i0+1)

  var constructor = getWord(str, i1)
  if(!constructor)
    return null

  var obj = {
    type: "object",
    constructor: constructor,
    arguments: [],
    flags: [],
    attributes: [],
  }

  var iN = i1 + constructor.length
  do {
    if(str[iN] == "]") {
      obj.length = iN-i0 + 1
      return obj
    }

    if(countWhitespace(str, iN)) {
      iN = skipCommentsAndWhitespace(str, iN)
      if(str[iN] == "]") {
        obj.length = iN-i0 + 1
        return obj
      }

      var arg = getArgument(str, iN)
      if(!arg)
        return null

      switch(arg.type) {
        case "id":
          obj.id = arg.id
          break;

        case "attribute":
          obj.attributes.push(arg)
          break;

        case "unnamedArgument":
          obj.arguments.push(arg)
          break;

        case "flag":
          obj.flags.push(arg)
          break;

        default:
          return null;
      }
      iN += arg.length
    } else
      return null

  } while(iN < str.length)

  return null
}

module.exports = getObject
const skipCommentsAndWhitespace = require("./skipCommentsAndWhitespace.js")
const getWord = require("./getWord")
const getArgument = require("./getArgument")
const countWhitespace = require("./countWhitespace")

},{"./countWhitespace":191,"./getArgument":193,"./getWord":216,"./skipCommentsAndWhitespace.js":218}],208:[function(require,module,exports){
function getObjectOrObjectProperty(str, i0) {
  i0 = i0 || 0
  var object = getObject(str, i0)
  if(!object)
    object = getObjectReference(str, i0)
  if(!object)
    object = getShorthand(str, i0)
  if(!object)
    return null

  var i1 = i0 + object.length
  var property = getDotProperty(str, i1)
  if(property)
    return {
      type: "objectProperty",
      property: property.property,
      object: object,
      "length": object.length + property.length,
    }
  else
    return object
}

module.exports = getObjectOrObjectProperty
const getObject = require("./getObject")
const getDotProperty = require("./getDotProperty")
const getObjectReference = require("./getObjectReference")
const getShorthand = require("./getShorthand")

},{"./getDotProperty":195,"./getObject":207,"./getObjectReference":209,"./getShorthand":212}],209:[function(require,module,exports){
const getWordWithDigits = require("./getWordWithDigits.js")

function getObjectReference(str, startIndex) {
  startIndex = startIndex || 0

  if(str[startIndex] != "#")
    return null

  var ref = getWordWithDigits(str, startIndex+1)
  if(ref)
    return {
      id: ref,
      "length": ref.length+1,
      type: "id",
    }
  else
    return null
}
module.exports = getObjectReference

},{"./getWordWithDigits.js":217}],210:[function(require,module,exports){
function getOperator(str, i0=0) {
  var winner = ""
  for(var i in operators) {
    var operator = getSpecific(operators[i], str, i0)
    if(operator && operator.length > winner.length)
      winner = operator
  }
  if(winner.length) {
    console.log("Got operator:", winner)
    return winner
  } else
    return null
}

module.exports = getOperator
const {operators} = require("./config")
const getSpecific = require("./getSpecific")

},{"./config":190,"./getSpecific":213}],211:[function(require,module,exports){
function getOperatorOperand(str, i0) {
  i0 = i0 || 0

  var i1 = i0
  var operator = getOperator(str, i0)//str[i1]
  var bindingOrder = config.operators.indexOf(operator)
  if(bindingOrder == -1)
    return null

  var i2 = skipCommentsAndWhitespace(str, i1+operator.length)

  var b = getExpression.simple(str, i2)
  if(!b)
    return null

  return {
    type: "operation",
    operator: operator,
    b: b,
    bindingOrder: bindingOrder,
    "length": i2-i0 + b.length,
  }
}

module.exports = getOperatorOperand
const getExpression = require("./getExpression.js")
const skipCommentsAndWhitespace = require("./skipCommentsAndWhitespace.js")
const config = require("./config")
const getOperator = require("./getOperator")

},{"./config":190,"./getExpression.js":196,"./getOperator":210,"./skipCommentsAndWhitespace.js":218}],212:[function(require,module,exports){
function getShorthand(str, i0) {
  i0 = i0 || 0
  var constr = getWord(str, i0)
  if(!constr || config.shorthandConstructors.indexOf(constr) == -1)
    return null

  var i = i0 + constr.length
  var args = []

  var n = getNumber(str, i)
  if(n) {
    args.push(n)
    i += n.length
    while(str[i] == ",") {
      i++
      var n = getNumber(str, i)
      if(!n)
        return null
      else {
        args.push(n)
        i += n.length
        continue
      }
    }
  }

  return {
    type: "shorthand",
    constructorAlias: constr,
    arguments: args,
    length: i-i0
  }
}

module.exports = getShorthand
const getWord = require("./getWord")
const getNumber = require("./getNumber")
const config = require("./config")

},{"./config":190,"./getNumber":206,"./getWord":216}],213:[function(require,module,exports){
function getSpecific(searchStr, str, i0) {
  i0 = i0 || 0
  for(var i=0; i<searchStr.length; i++)
    if(str[i + i0] != searchStr[i])
      return null

  return searchStr
}
module.exports = getSpecific

},{}],214:[function(require,module,exports){
function getString(str, i0) {
  i0 = i0 || 0

  if(str[i0] == "\"")
    var endChar = "\""
  else if(str[i0] == "'")
    var endChar = "'"
  else
    return null

  var i1
  do {
    i1 = str.indexOf(endChar, i0+1)
    if(i1 == -1)
      return null
  } while(str[i1-1] == "\\")

  return {
    type: "string",
    string: str.slice(i0+1, i1),
    length: i1-i0+1
  }
}

module.exports = getString

},{}],215:[function(require,module,exports){
// variables begin with a $ sign just like in php

const getWordWithDigits = require("./getWordWithDigits.js")

function getVariable(str, startIndex) {
  startIndex = startIndex || 0

  if(str[startIndex] != "$")
    return null

  var ref = getWordWithDigits(str, startIndex+1)
  if(ref)
    return {
      id: ref,
      "length": ref.length+1,
      type: "variable",
    }
  else
    return null
}
module.exports = getVariable

},{"./getWordWithDigits.js":217}],216:[function(require,module,exports){
arguments[4][203][0].apply(exports,arguments)
},{"./findCoordinate":192,"dup":203}],217:[function(require,module,exports){

const wordRegex = /[a-zA-Z0-9_]/

function getWordWithDigits(str, startIndex) {
  startIndex = startIndex || 0

  for(var i=startIndex; i<=str.length; i++) {
    var c = str[i]
    if(!wordRegex.test(c))
      if(i==startIndex)
        return null
      else
        return str.slice(startIndex, i)
  }
}
module.exports = getWordWithDigits

},{}],218:[function(require,module,exports){
const skipWhitespace = require('./skipWhitespace')
const skipLineComment = require('./skipLineComment')
const skipMultilineComment = require('./skipMultilineComment')

function skipCommentsAndWhitespace(str, i0) {
  let i1 = i0
  let i2 = i1
  do {
    i1 = i2
    i2 = skipWhitespace(str, i1)
    i2 = skipLineComment(str, i2)
    i2 = skipMultilineComment(str, i2)
  } while(i1 != i2)


  return i2
}
module.exports = skipCommentsAndWhitespace

},{"./skipLineComment":219,"./skipMultilineComment":220,"./skipWhitespace":221}],219:[function(require,module,exports){
function skipLineComment(str, i0) {
  if(str[i0] == '/' && str[i0+1] == '/') {
    let iEnd = str.indexOf('\n', i0+2)
    if(iEnd != -1)
      return iEnd+1
    else
      return str.length
  } else
    return i0
}
module.exports = skipLineComment

},{}],220:[function(require,module,exports){
function skipMultilineComment(str, i0) {
  if(str.slice(i0, i0+2) == '/*') {
    let iEnd = str.indexOf('*/', i0+2)
    if(iEnd != -1)
      return iEnd+2
    else
      throw "open ended comment"
  } else {
    return i0
  }
}
module.exports = skipMultilineComment

},{}],221:[function(require,module,exports){
arguments[4][205][0].apply(exports,arguments)
},{"dup":205}],222:[function(require,module,exports){
const Patch = require("../Patch.js")
const AllPass = require("../components/AllPass.js")

class APStack extends Patch {
  constructor(n=4, maxDelay=0.1, maxFeedback=0.5) {
    super()
    var ap = null
    var last = null
    var stack = AllPass.manyRandom(n, maxDelay, maxFeedback)
    for(var i=1; i<stack.length; i++)
      stack[i].IN = stack[i-1]

    /*[]
    for(var i=0; i<n; i++) {
      var delay = 2/this.sampleRate + Math.random()*(maxDelay-2/this.sampleRate)
      while(delay == 0)
        var delay = Math.random()*maxDelay

      ap = new AllPass(Math.random()*maxDelay, Math.random()*maxFeedback)
      if(last)
        ap.IN = last
      last = ap
      stack.push(ap)
    }*/

    this.addUnits(stack)

    this.aliasInlet(stack[0].IN, "in")
    this.aliasOutlet(stack[stack.length-1].OUT, "out")
  }
}
module.exports = APStack

},{"../Patch.js":105,"../components/AllPass.js":113}],223:[function(require,module,exports){
const Patch = require("../Patch")
const AttenuationMatrix = require("./AttenuationMatrix.js")
const AllPass = require("../components/AllPass.js")

class APWeb extends Patch {
  constructor(n=4, maxDelay=0.01, maxFeedback=0.1) {
    super()
    var list = AllPass.manyRandom(n, maxDelay, maxFeedback)
      //.map(ap => {return {"IN":ap.IN, "OUT":ap.OUT}})

    var matrix = new AttenuationMatrix({
      nodes:list,
      //maxAmmount: 0.1,
      //pConnection: 0.1,
      allowFeedback:false,
      pMix:1,        
    })
    this.addUnits(matrix)
    console.log(matrix.IN)
    this.aliasInlet(matrix.IN, "in")
    this.aliasOutlet(matrix.OUT, "out")
  }
}
module.exports = APWeb

},{"../Patch":105,"../components/AllPass.js":113,"./AttenuationMatrix.js":224}],224:[function(require,module,exports){
const Patch = require("../Patch.js")
const Mixer = require("./Mixer.js")

class AttenuationMatrix extends Patch {
  constructor({
    nodes,
    pConnection=0.5,
    pMix=0.5,
    maxAmmount=1,
    minAmmount=0,
    maxMixAmmount=1,
    minMixAmmount=0,
    allowFeedback=true
  }) {
    super()
    var outMixer = new Mixer
    for(var i=0; i<nodes.length; i++) {
      var mixer = new Mixer()
      for(var j=0; j<nodes.length; j++) {
        if(j < i && !allowFeedback)
          continue
        if(Math.random() < pConnection) {
          var ammount = Math.random()*(maxAmmount-minAmmount) + minAmmount
          mixer.addAttenuated(nodes[j].OUT, ammount)
        }
      }
      if(mixer.numberOfInputs) {
        this.addUnits(mixer)
        nodes[i].IN = mixer
      }
      if(Math.random() < pMix) {
        var ammount = Math.random()*(maxMixAmmount-minMixAmmount) + minAmmount
        outMixer.addAttenuated(nodes[i].OUT, ammount)
      }
    }

    this.aliasInlet(nodes[0].IN, "in")
    this.aliasOutlet(outMixer.OUT, "out")
  }
}
module.exports = AttenuationMatrix

},{"../Patch.js":105,"./Mixer.js":237}],225:[function(require,module,exports){
const Patch = require("../Patch.js")
const Filter = require("../components/Filter.js")

class BandFilter extends Patch {
  constructor(input, fLow, fHigh) {
    super()

    this.addUnits(
      this.lowPass = new Filter(input, fHigh, "LP"),
      this.highPass = new Filter(this.lowPass.OUT, fLow, "HP")
    )
    this.highPass.kind = "HP"
    console.log(this.highPass)

    this.aliasInlet(this.lowPass.IN)
    this.aliasInlet(this.lowPass.F, "fHigh")
    this.aliasInlet(this.highPass.F, "fLow")
    this.aliasOutlet(this.highPass.OUT)
  }
}
module.exports = BandFilter

},{"../Patch.js":105,"../components/Filter.js":124}],226:[function(require,module,exports){
const Patch = require("../Patch.js")
const Shape = require("../components/Shape")
const Osc = require("../components/Osc")
const Multiply = require("../components/Multiply.js")

class Boop extends Patch {
  constructor(f, duration) {
    super()
    this.addUnits(
      this.osc = new Osc(f),
      this.envelope = new Shape("decay", duration).trigger(),
      this.mult = new Multiply(this.osc, this.envelope)
    )

    this.envelope.onFinish = () => {
      this.finish()
    }

    this.aliasOutlet(this.mult.OUT)
  }

  trigger() {
    this.envelope.trigger()
  }
  stop() {
    this.envelope.stop()
  }
}
module.exports = Boop

},{"../Patch.js":105,"../components/Multiply.js":135,"../components/Osc":139,"../components/Shape":153}],227:[function(require,module,exports){
const Patch = require("../Patch.js")
const CircularMotion = require("../components/vector/CircularMotion.js")
const Multiply = require("../components/Multiply.js")
const Repeater = require("../components/Repeater.js")

function ComplexOrbit( frequencyRatios, radiusRatios, centre) {
  Patch.call(this)

  var n
  frequencyRatios = frequencyRatios || 4
  if(frequencyRatios.constructor == Number) {
    n = frequencyRatios
    radiusRatios = []
    for(var i=0; i<n; i++)
      frequencyRatios[i] = Math.random()
  }
  n = frequencyRatios.length

  this.addUnits(
    this.frequencyRepeater = new Repeater(),
    this.radiusRepeater = new Repeater(),
  )

  radiusRatios = radiusRatios || []
  if(radiusRatios.constructor == Number) {
    var rMax = radiusRatios
    radiusRatios = []
  } else
    rMax = 1
  var current, last
  this.circs = []
  for(var i=0; i<n; i++) {
    radiusRatios[i] = radiusRatios[i] || rMax * Math.random()

    current = new CircularMotion()
    current.CENTRE = last ? last.OUT : [0,0];
    current.F = new Multiply(frequencyRatios[i], this.frequencyRepeater)
    current.RADIUS = new Multiply(radiusRatios[i], this.radiusRepeater)
    current.phase = Math.random() * Math.PI * 2

    this.circs[i] = current
    this.addUnit(current)
    last = current
  }

  this.frequencyRatios = frequencyRatios
  this.radiusRatios = radiusRatios

  this.aliasInlet(this.circs[0].CENTRE)
  this.aliasInlet(this.frequencyRepeater.IN, "f")
  this.aliasInlet(this.radiusRepeater.IN, "r")
  this.aliasOutlet(last.OUT)


  this.CENTRE = centre || [0,0]
  this.F = 1
  this.R = 1
}
ComplexOrbit.prototype = Object.create(Patch.prototype)
ComplexOrbit.prototype.constructor = ComplexOrbit
module.exports = ComplexOrbit

ComplexOrbit.random = function(n, fMax, rMax, oMax) {
  n = n || 5
  fMax = fMax || 1
  rMax = rMax || 1
  oMax = oMax || 0

  var radiusRatios = []
  var frequencyRatios = []
  for(var i=0; i<n; i++) {
    radiusRatios[i] = Math.random()*rMax
    frequencyRatios[i] = Math.random()*fMax
  }
  var centre = [
    oMax * (Math.random()*2-1),
    oMax * (Math.random()*2-1),
  ]

  return new ComplexOrbit( frequencyRatios, radiusRatios, centre)
}

},{"../Patch.js":105,"../components/Multiply.js":135,"../components/Repeater.js":147,"../components/vector/CircularMotion.js":175}],228:[function(require,module,exports){
const Patch = require("../Patch")
const CircleBuffer = require("../CircleBuffer.js")
const CircleBufferReader = require("../components/CircleBufferReader.js")
const CircleBufferWriter = require("../components/CircleBufferWriter.js")
const quick = require("../quick.js")

class DelayMixer extends Patch {
  constructor(nChannels, maxDelay) {
    super()

    if(!nChannels || !maxDelay)
      throw "DelayMixer requires constructor arguments: (nChannels, maxDelay)"

    this.buffer = new CircleBuffer(nChannels, maxDelay)

    this.addUnits(
      this.outReader = new CircleBufferReader(this.buffer)
    )
    this.outReader.postWipe = true

    this.aliasOutlet(this.outReader.OUT)
  }

  addInput(input, delay, attenuation) {
    var writer = new CircleBufferWriter(this.buffer, delay)
    writer.t = this.outReader.t
    this.outReader.chain(writer)
    this.addUnits(writer)

    if(attenuation)
      writer.IN = quick.multiply(input, attenuation)
    else
      writer.IN = input
  }
}
module.exports = DelayMixer

},{"../CircleBuffer.js":99,"../Patch":105,"../components/CircleBufferReader.js":115,"../components/CircleBufferWriter.js":116,"../quick.js":254}],229:[function(require,module,exports){
const Patch = require("../Patch.js")
const Repeater = require("../components/Repeater.js")

const Osc = require("../components/Osc/MultiChannelOsc")
const SemitoneToRatio = require("../components/SemitoneToRatio.js")
const Multiply = require("../components/Multiply.js")

function FMOsc(f) {
  Patch.call(this)

  this.addUnits(
    this.fRepeater = new Repeater(),
    this.osc = new Osc(this.fRepeater),
  )

  this.osc.randomPhaseFlip()

  this.aliasInlet(this.fRepeater.IN, "f")
  this.aliasOutlet(this.osc.OUT)

  this.F = f || 440
}
FMOsc.prototype = Object.create(Patch.prototype)
FMOsc.prototype.constructor = FMOsc
module.exports = FMOsc

FMOsc.prototype.isFMOsc = true

FMOsc.prototype.addModulator = function(modulator, ammount) {
  ammount = ammount || 1

  var multiply1 = new Multiply(modulator, ammount)
  var m2f = new SemitoneToRatio(multiply1)
  var multiply2 = new Multiply(m2f, this.osc.F.outlet)

  this.addUnits(
    multiply1,
    multiply2,
    m2f,
  )

  this.osc.F = multiply2
}

FMOsc.prototype.addModulatorOsc = function(f, ammount) {
  this.addModulator(
    new FMOsc(f),
    ammount,
  )
}

FMOsc.prototype.clearModulation = function() {
  this.osc.F = this.fRepeater
}

FMOsc.prototype.resetPhase = function() {
  this.osc.resetPhase()
}

},{"../Patch.js":105,"../components/Multiply.js":135,"../components/Osc/MultiChannelOsc":137,"../components/Repeater.js":147,"../components/SemitoneToRatio.js":152}],230:[function(require,module,exports){

const Synth = require("./Synth.js")
const unDusp = require("../unDusp")
const dusp = require("../dusp")

const quick = require("../quick.js")
const Osc = require("../patches/FMOsc")
const FrequencyGroup = require("./FrequencyGroup.js")
const StereoDetune = require("./StereoDetune.js")
const Mixer = require("./Mixer.js")
const Shape = require("../components/Shape")
const Worm = require("./Worm.js")

class FMSynth extends Synth {
  constructor(seed) {
    super()
    console.warn("FMSynth will not work until unDusp has been reimplemented")
    this.resetOscsOnTrigger = seed.resetOscsOnTrigger || true

    // unDusp the seed
    var unduspIndex = {}
    var fundamental = unDusp(seed.fundamental, unduspIndex)
    var globalModulation = unDusp(seed.mod || 1, unduspIndex)
    var envelopes = (seed.envelopes || []).map(env => unDusp(env, unduspIndex))
    var oscSeeds = seed.oscs.map(osc => {return {
      h: unDusp(osc.h, unduspIndex),
      stereoDetune: unDusp(osc.stereoDetune || 0, unduspIndex),
      modulation: (osc.modulation || []).map(attenuation => unDusp(attenuation, unduspIndex)),
      mix: unDusp(osc.mix || 0, unduspIndex)
    }})


    // make a dusp version of the seed
    var duspIndex = {}
    this.seed = {
      fundamental: dusp(fundamental, duspIndex),
      mod: dusp(globalModulation, duspIndex),
      oscs: oscSeeds.map(osc => {
        var oscSeed = {
          h: dusp(osc.h, duspIndex),
        }
        if(osc.stereoDetune)
          oscSeed.stereoDetune = dusp(osc.stereoDetune, duspIndex)
        if(osc.mix)
          oscSeed.mix = dusp(osc.mix, duspIndex)
        if(osc.modulation && osc.modulation.length)
          oscSeed.modulation = osc.modulation.map(attenuation => dusp(attenuation, duspIndex))
        return oscSeed
      }),
      resetOscsOnTrigger: this.resetOscsOnTrigger,
    }
    if(envelopes.length)
      this.seed.envelopes = envelopes.map(env => dusp(env, duspIndex))

    if(dusp.usingShorthands)
      console.warn("Possible unDusping errors with this seed, multiple references to the envelopes which may be shorthanded")


    for(var i in envelopes)
      this.addEnvelope(envelopes[i])

    var fGroup = new FrequencyGroup(fundamental)
    for(var i in oscSeeds)
      fGroup.addHarmonic(oscSeeds[i].h)


    var oscs = []
    for(var i=0; i<oscSeeds.length; i++) {
      if(oscSeeds[i].stereoDetune)
        oscs[i] = new Osc(
          new StereoDetune(fGroup.fOuts[i+1], oscSeeds[i].stereoDetune)
        )
      else
        oscs[i] = new Osc(fGroup.fOuts[i+1])
    }


    for(var carrier in oscSeeds)
      if(oscSeeds[carrier].modulation)
        for(var modulator in oscSeeds[carrier].modulation) {
          var ammount = oscSeeds[carrier].modulation[modulator]
          if(ammount) {
            oscs[carrier].addModulator(oscs[modulator], quick.multiply(ammount, globalModulation))
          }
        }

    var mixer = new Mixer()
    for(var i in oscs) {
      if(oscSeeds[i].mix)
        mixer.addInput(quick.multiply(oscs[i], oscSeeds[i].mix))
    }

    this.oscs = oscs
    this.addUnits(fGroup, oscs, mixer)

    this.aliasOutlet(mixer.OUT, "OUT")
    this.aliasInlet(fGroup.F, "F")
  }

  _trigger(p) {
    this.F = quick.pToF(p)
    if(this.resetOscsOnTrigger)
      for(var i in this.oscs)
        this.oscs[i].resetPhase()
  }

  static randomSeed({
    f = 50,
    duration = 1,
    nOscs = 8,
    pConnection = 0.1,
    maxModulationAmmount = 6,
    pMix = 0.5,
    maxStereoDetune = 1/2,
  }) {
    nOscs = nOscs || 4

    var oscs = []
    var envelopes = []
    for(var i=0; i<nOscs; i++) {
      var osc = {
        h: Math.ceil(Math.random()*32),
        modulation: [],
      //  stereoDetune: Math.random() * maxStereoDetune,
      }
      if(Math.random() < pMix) {
        var envelope = Shape.randomDecay(duration, 0, 1)
        envelopes.push(envelope)
        osc.mix = quick.multiply(envelope, Math.random())
      }
      for(var j=0; j<nOscs; j++) {
        if(Math.random() < pConnection) {
          var envelope = Shape.randomInRange(duration, 0, 1)
          envelopes.push(envelope)
          osc.modulation.push(envelope, quick.multiply(Math.random(), maxModulationAmmount))
        }
      }
      oscs.push(osc)
    }

    return {
      fundamental: f,
      oscs: oscs,
      envelopes: envelopes,
    }
  }

  static wormSeed({
    f = 50,
    nOscs = 8,
    pConnection = 0.1,
    maxModulationAmmount = 6,
    pMix = 0.5,
    maxStereoDetune = 1/2,
    maxHarmonic = 16,
    maxWormFrequency = 5
  }) {
    nOscs = nOscs || 4

    var oscs = []
    var envelopes = []
    for(var i=0; i<nOscs; i++) {
      var osc = {
        h: Math.ceil(quick.multiply(Math.random(), maxHarmonic)),
        modulation: [],
        stereoDetune: Math.random() * maxStereoDetune,
      }
      if(Math.random() < pMix) {
        var envelope = Math.random()//Worm.random()
        envelopes.push(envelope)
        osc.mix = quick.multiply(envelope, Math.random())
      }
      for(var j=0; j<nOscs; j++) {
        if(Math.random() < pConnection) {
          var envelope = Worm.random(maxWormFrequency)
          envelopes.push(envelope)
          osc.modulation.push(envelope, quick.multiply(Math.random(), maxModulationAmmount))
        }
      }
      oscs.push(osc)
    }

    return {
      fundamental: f,
      oscs: oscs,
      envelopes: envelopes,
    }
  }
}
module.exports = FMSynth

},{"../components/Shape":153,"../dusp":187,"../patches/FMOsc":229,"../quick.js":254,"../unDusp":256,"./FrequencyGroup.js":231,"./Mixer.js":237,"./StereoDetune.js":247,"./Synth.js":249,"./Worm.js":251}],231:[function(require,module,exports){
const Patch = require("../Patch.js")
const Repeater = require("../components/Repeater.js")
const quick = require("../quick.js")

function FrequencyGroup(f) {
  Patch.call(this)

  this.addUnits(
    this.fundamentalRepeater = new Repeater(f || 440, "Hz")
  )

  this.fOuts = [this.fundamentalRepeater.OUT]

  this.alias(this.fundamentalRepeater.IN, "f")

  //this.F = f || 440
}
FrequencyGroup.prototype = Object.create(Patch.prototype)
FrequencyGroup.prototype.constructor = FrequencyGroup
module.exports = FrequencyGroup

FrequencyGroup.prototype.addHarmonic = function(ratio) {
  var harmonic = quick.mult(this.fOuts[0], ratio)
  this.fOuts.push(
    harmonic,
  )
  return harmonic
}
FrequencyGroup.prototype.addRandomHarmonic = function(maxNum, maxDenom) {
  maxNum = maxNum || 8
  maxDenom = maxDenom || 8
  var numerator = Math.ceil(Math.random() * maxNum)
  var denominator = Math.ceil(Math.random()*maxDenom)
  return this.addHarmonic(numerator/denominator)
}
FrequencyGroup.prototype.addRandomHarmonics = function(n, maxNum, maxDenom) {
  n = n || 1
  var harmonicsAdded = []
  for(var i=0; i<n; i++)
    harmonicsAdded[i] = this.addRandomHarmonic(maxNum, maxDenom)
  return harmonicsAdded
}

},{"../Patch.js":105,"../components/Repeater.js":147,"../quick.js":254}],232:[function(require,module,exports){
/*
  A spectrally implemented band pass filter with sqaure attenuation curves.
*/


const Patch = require("../Patch.js")

const HardLP = require("../components/spectral/HardLowPass.js")
const HardHP = require("../components/spectral/HardHighPass.js")


class HardBandPass extends Patch {
  constructor(input, low, high) {
    super()

    this.addUnits(
      this.lp = new HardLP(low),
      this.hp = new HardHP(high),
    )

    this.hp.IN = this.lp.OUT

    this.aliasInlet(this.lp.IN, "in")
    this.aliasInlet(this.hp.F, "low")
    this.aliasInlet(this.lp.F, "high")
    this.aliasOutlet(this.hp.OUT)

    this.IN = input || 0
    console.log("low:", low)
    this.LOW = low || 0
    this.HIGH = high || 22000
  }
}
module.exports = HardBandPass

},{"../Patch.js":105,"../components/spectral/HardHighPass.js":165,"../components/spectral/HardLowPass.js":166}],233:[function(require,module,exports){
/*
  A Karplus-Strong string synthesis patch.
*/

const Patch = require("../Patch")
const config = require('../config')

// components:
const Delay = require('../components/Delay')
const Filter = require('../components/Filter')
const Sum = require('../components/Sum')
const Repeater = require('../components/Repeater')
const Divide = require('../components/Divide')
const Multiply = require('../components/Multiply')
const Noise = require('../components/Noise')
const Shape = require('../components/Shape')
const quick = require('../quick')

class Karplus extends Patch {
  constructor(frequency=500, resonance=1) {
    super()

    // assemble circuit
    this.addUnits(
      this.delayTime = new Divide(config.sampleRate, frequency),
      this.delay = new Delay(0 /*sum output*/, quick.subtract(this.delayTime, config.standardChunkSize),  config.sampleRate),
      this.cutOff = new Multiply(10000),
      this.filter = new Filter(this.delay, this.cutOff),
      this.sum = new Sum(this.filter),
    )
    this.delay.IN = this.sum.OUT
    console.log('sample rate:', this.sampleRate)


    this.aliasInlet(this.sum.B, 'energy') // trigger signal
    this.aliasInlet(this.delayTime.B, 'f') // frequency
    this.aliasInlet(this.cutOff.B, 'resonance') // resonance
    this.aliasOutlet(this.sum.OUT) // output

    this.F = frequency
    this.RESONANCE = resonance
    this.ENERGY = 0
  }

  pluck(softness=0, amplitude=1, duration=0.01) {
    if(softness.constructor != Number || softness<0 || softness>1)
      throw 'Karplus.pluck expects softness to be a number (0-1)'

    let noise = new Noise()
    if(softness)
      noise = new Filter(noise, (1-softness) * 11000 + 1, 'LP')

    let shape = new Shape('decay', duration, 0, amplitude).trigger()

    this.addEnergy(quick.multiply(noise, shape))

    return this
  }
  schedulePluck(secondDelay, softness, amplitude, duration) {
    this.schedule(secondDelay, () => {
      this.pluck(softness, amplitude, duration)
      console.log("PLUCKING")
    })
  }

  addEnergy(outlet, rescale=1) {
    outlet = quick.multiply(rescale, outlet)
    this.ENERGY = quick.sum(this.ENERGY.get(), outlet)
    return this
  }

  static interbleed(karpli, scale=0.001) {
    for(let A of karpli)
      for(let B of karpli) {
        if(A == B)
          continue
        A.addEnergy(B, scale)
      }
  }
}
module.exports = Karplus

},{"../Patch":105,"../components/Delay":122,"../components/Divide":123,"../components/Filter":124,"../components/Multiply":135,"../components/Noise":136,"../components/Repeater":147,"../components/Shape":153,"../components/Sum":158,"../config":177,"../quick":254}],234:[function(require,module,exports){
const Patch = require("../Patch.js")
const Osc = require("../components/Osc")
const Multiply = require("../components/Multiply.js")
const Sum = require("../components/Sum.js")

function LFO(frequency, amplitude, origin, waveform) {
  Patch.call(this)

  var osc1 = new Osc()
  this.alias(osc1.F)
  this.osc = osc1

  var mult1 = new Multiply(osc1.OUT)
  this.alias(mult1.B, "a")

  var location = new Sum(mult1.OUT)
  this.alias(location.B, "o")
  this.alias(location.OUT)

  this.addUnits(
    osc1, mult1, location
  )

  this.F = frequency || 1
  this.A = amplitude || 1/2
  this.O = origin || 1/2
  this.waveform = waveform || "sine"
}
LFO.prototype = Object.create(Patch.prototype)
LFO.prototype.constructor = LFO
module.exports = LFO

LFO.randomInRange = function(maxF, minMin, maxMax, waveform) {
  var a = minMin + (maxMax-minMin) * Math.random()
  var b = minMin + (maxMax-minMin) * Math.random()
  if(a > b) {
    var max = a
    var min = b
  } else {
    var max = b
    var min = a
  }

  return new LFO(
    Math.random()*maxF,
    (min + max)/2,
    Math.random() * (max-min),
    waveform,
  )
}

LFO.prototype.__defineGetter__("waveform", function() {
  return this.osc.waveform
})
LFO.prototype.__defineSetter__("waveform", function(waveform) {
  this.osc.waveform = waveform
})

},{"../Patch.js":105,"../components/Multiply.js":135,"../components/Osc":139,"../components/Sum.js":158}],235:[function(require,module,exports){
const Patch = require("../Patch.js")
const StereoOsc = require("./StereoOsc")
const Repeater = require("../components/Repeater.js")
const Osc = require("../components/Osc")
const Sum = require("../components/Sum.js")
const Multiply = require("../components/Multiply.js")

function ManyOsc(oscs) {
  Patch.call(this)

  var mix = Sum.many(oscs)

  this.addUnits(mix, oscs)

  this.alias(mix.OUT, "OUT")
}
ManyOsc.prototype = Object.create(Patch.prototype)
ManyOsc.prototype.constructor = ManyOsc
module.exports = ManyOsc

ManyOsc.prototype.isManyOsc = true

ManyOsc.ofFrequencies = function(fundamental, ratios) {
  var oscs = []
  for(var i in ratios) {
    var osc = new Osc()
    osc.F = new Multiply(fundamental, ratios[i])
    oscs[i] = osc
  }
  var manyosc = new ManyOsc(oscs)
  return manyosc
}

ManyOsc.random = function(n, min, max) {
  n = n || 3
  min = min || 20
  max = max || 1000
  var freqs = []
  for(var i=0; i<n; i++) {
    freqs[i] = min + Math.random()*(max-min)
  }

  console.log(freqs)
  return ManyOsc.ofFrequencies(1, freqs)
}

},{"../Patch.js":105,"../components/Multiply.js":135,"../components/Osc":139,"../components/Repeater.js":147,"../components/Sum.js":158,"./StereoOsc":248}],236:[function(require,module,exports){
const Patch = require("../Patch.js")
const Osc = require("../components/Osc")
const MidiToFrequency = require("../components/MidiToFrequency.js")

function MidiOsc(p) {
  Patch.call(this)

  this.addUnits(
    this.mToF = new MidiToFrequency(),
    this.osc = new Osc(this.mToF.FREQUENCY),
  )

  this.aliasInlet(this.mToF.MIDI, "P")
  this.aliasOutlet(this.osc.OUT)

  this.P = p || 69
}
MidiOsc.prototype = Object.create(Patch.prototype)
MidiOsc.prototype.constructor = MidiOsc
module.exports = MidiOsc

},{"../Patch.js":105,"../components/MidiToFrequency.js":132,"../components/Osc":139}],237:[function(require,module,exports){
const Patch = require("../Patch.js")
const Repeater = require("../components/Repeater.js")
const Sum = require("../components/Sum.js")
const Multiply = require("../components/Multiply.js")
const Gain = require("../components/Gain.js")

function Mixer(...inputs) {
  Patch.call(this)

  this.sums = []
  this.inputs = []

  this.addUnits(
    this.addRepeater = new Repeater(0)
  )

  this.aliasOutlet(this.addRepeater.OUT)

  for(var i in inputs)
    this.addInput(inputs[i])
}
Mixer.prototype = Object.create(Patch.prototype)
Mixer.prototype.constructor = Mixer
module.exports = Mixer

Mixer.prototype.addInput = function(outlet) {
  if(!outlet.isOutlet && outlet.defaultOutlet)
    outlet = outlet.defaultOutlet

  if(this.inputs.length == 0) {
    this.addRepeater.IN = outlet
    this.inputs.push(outlet)
  } else if(this.inputs.length == 1) {
    var newSum = new Sum(this.addRepeater.IN.outlet, outlet)
    this.addRepeater.IN = newSum
    this.inputs.push(outlet)
    this.sums.push(newSum)
  } else {
    var lastSum = this.sums[this.sums.length-1]
    var lastInput = lastSum.B.outlet
    var newSum = new Sum(lastInput, outlet)
    lastSum.B = newSum
    this.inputs.push(outlet)
    this.sums.push(newSum)
  }
  return this
}

Mixer.prototype.addMultiplied = function(outlet, sf) {
  if(!sf)
    return this.addInput(outlet)
  else
    return this.addInput(
      new Multiply(outlet, sf)
    )
}

Mixer.prototype.addAttenuated = function(outlet, gain) {
  if(!gain)
    return this.addInput(outlet)
  var gainU = new Gain()
  gainU.IN = outlet
  gainU.GAIN = gain
  return this.addInput(gainU)
}

Mixer.prototype.addInputs = function() {
  for(var i in arguments)
    if(arguments[i].constructor == Array)
      for(var j in arguments[i])
        this.addInput(arguments[i][j])
    else
      this.addInput(arguments[i])

  return this
}

Mixer.prototype.removeInputByIndex = function(index) {
  if(index > this.units.length) {
    console.log(this.label, "can't remove input", index,  "because it doesn't exist")
  }
  if(this.inputs.length == 1 && index == 0) {
      this.addRepeater.IN = 0
      this.inputs.shift()
  } else if(this.inputs.length > 0) {
    if(index == this.inputs.length-1) {
      this.sums[this.sums.length-1].collapseA()
      this.sums.splice(this.sums.length-1, 1)
      this.inputs.splice(index, 1)
    } else {
      this.sums[index].collapseB()
      this.sums.splice(index, 1)
      this.inputs.splice(index, 1)
    }
  }
}

Mixer.prototype.removeInput = function(outlet) {
  if(outlet == undefined) {
    console.log(this.label, "can't remove input:", outlet)
    return ;
  }

  if(outlet.constructor == Number)
    return this.removeInputByIndex(outlet)
  if(outlet.isPatch || outlet.isUnit)
    outlet = outlet.defaultOutlet
  if(outlet.isOutlet) {
    var index = this.inputs.indexOf(outlet)
    if(index == -1)
      console.log(this.label, "could not remove", outlet.label, "because it is not connected to it")
    else
      this.removeInputByIndex(index)
  }
}

Mixer.prototype.__defineGetter__("numberOfInputs", function() {
  return this.inputs.length
})

},{"../Patch.js":105,"../components/Gain.js":127,"../components/Multiply.js":135,"../components/Repeater.js":147,"../components/Sum.js":158}],238:[function(require,module,exports){
const Patch = require("../Patch.js")
const CircleBuffer = require("../CircleBuffer.js")
const CircleBufferReader = require("../components/CircleBufferReader.js")
const CircleBufferWriter = require("../components/CircleBufferWriter.js")
const quick = require("../quick.js")


class MultiTapDelay extends Patch {
  constructor(nChannels, maxDelay, input) {
    super()

    if(!nChannels || !maxDelay)
      throw "MultiTapDelay requires constructor args (nChannels, maxDelay[, input])"

    this.addUnits(
      this.buffer = new CircleBuffer(nChannels, maxDelay),
      this.writer = new CircleBufferWriter(this.buffer),
    )

    this.writer.preWipe = true

    this.aliasInlet(this.writer.IN)

    this.IN = input || 0
  }

  addTap(delay) {
    var reader = new CircleBufferReader(this.buffer, delay)
    reader.t = this.writer.t
    this.addUnits(reader)
    reader.chain(this.writer)
    return reader
  }

  addFeedback(delay, feedbackGain, feedbackDelay) {
    var reader = this.addTap(delay)
    var writer = new CircleBufferWriter(this.buffer, feedbackDelay || 0)
    writer.IN = quick.multiply(reader, feedbackGain)
    writer.t = this.writer.t
    writer.chain(this.writer)
    this.addUnits(writer)
    return reader
  }
}
module.exports = MultiTapDelay

},{"../CircleBuffer.js":99,"../Patch.js":105,"../components/CircleBufferReader.js":115,"../components/CircleBufferWriter.js":116,"../quick.js":254}],239:[function(require,module,exports){
const Patch = require("../Patch.js")
const MidiOsc = require("./MidiOsc")
const Osc = require("../components/Osc")
const Space = require("./Space.js")
const ComplexOrbit = require("./ComplexOrbit.js")

function OrbittySine(f, speed, r, centre) {
  Patch.call(this)

  this.addUnits(
    this.osc = new Osc(),
    this.orbit = new ComplexOrbit.random(),
    this.space = new Space(this.osc, this.orbit),
  )

  this.aliasInlet(this.osc.F, "f")
  this.aliasInlet(this.orbit.F, "speed")
  this.aliasInlet(this.orbit.R, "r")
  this.aliasInlet(this.orbit.CENTRE, "centre")
  this.aliasOutlet(this.space.OUT, "out")

  this.F = f || 200
  this.SPEED = speed || 1
  this.R = r || 1
  this.CENTRE = centre || [0,0]
}
OrbittySine.prototype = Object.create(Patch.prototype)
OrbittySine.prototype.constructor = OrbittySine
module.exports = OrbittySine

OrbittySine.prototype.__defineGetter__("waveform", function() {
  return this.osc.waveform
})
OrbittySine.prototype.__defineSetter__("waveform", function(waveform) {
  this.osc.waveform = waveform
})

},{"../Patch.js":105,"../components/Osc":139,"./ComplexOrbit.js":227,"./MidiOsc":236,"./Space.js":244}],240:[function(require,module,exports){
const Patch = require("../Patch.js")
const Space = require("./Space.js")
const Repeater = require("../components/Repeater.js")
const Multiply = require("../components/Multiply.js")

function ScaryPatch(input, ammount) {
  Patch.call(this)

  this.addUnits(
    this.inRepeater = new Repeater(),
    this.ammountScaler = new Multiply(this.inRepeater, 1),
    this.space = new Space(
      this.inRepeater,
      this.ammountScaler
    ),
  )

  this.alias(this.inRepeater.IN)
  this.aliasInlet(this.ammountScaler.B, "ammount")
  this.alias(this.space.OUT)

  this.IN = input || [0,0]
  this.AMMOUNT = ammount || 1
}
ScaryPatch.prototype = Object.create(Patch.prototype)
ScaryPatch.prototype.constructor = ScaryPatch
module.exports = ScaryPatch

},{"../Patch.js":105,"../components/Multiply.js":135,"../components/Repeater.js":147,"./Space.js":244}],241:[function(require,module,exports){
const Patch = require("../Patch.js")
const CrossFader = require("../components/CrossFader.js")
const Delay = require("../components/Delay.js")
const Sum = require("../components/Sum.js")
const Multiply = require("../components/Multiply.js")
const Repeater = require("../components/Repeater.js")
const SecondsToSamples = require("../components/SecondsToSamples.js")

function SimpleDelay(input, delay, feedback, dryWet) {
  Patch.call(this)

  this.addUnits(
    this.inputRepeater = new Repeater(),
    this.feedbackInputSum = new Sum(),
    this.delayer = new Delay(),
    this.mixDryWet = new CrossFader(),
    this.feedbackScaler = new Multiply(),
    this.delayScaler = new SecondsToSamples(),
  )

  this.feedbackInputSum.A = this.inputRepeater.OUT
  this.feedbackInputSum.B = this.feedbackScaler.OUT
  this.feedbackScaler.A = this.delayer.OUT
  this.mixDryWet.B = this.delayer.OUT
  this.mixDryWet.A = this.inputRepeater.OUT
  this.delayer.IN = this.feedbackInputSum.OUT
  this.delayer.DELAY = this.delayScaler.OUT

  this.aliasInlet(this.inputRepeater.IN)
  this.aliasInlet(this.delayScaler.IN, "delay")
  this.aliasInlet(this.feedbackScaler.B, "feedback")
  this.aliasInlet(this.mixDryWet.DIAL, "dryWet")
  this.aliasOutlet(this.mixDryWet.OUT)

  this.IN = input || 0
  this.DELAY = delay || 4410
  this.FEEDBACK = feedback || 0
  this.DRYWET = dryWet || 0.4
}
SimpleDelay.prototype = Object.create(Patch.prototype)
SimpleDelay.prototype.constructor = SimpleDelay
module.exports = SimpleDelay

},{"../Patch.js":105,"../components/CrossFader.js":120,"../components/Delay.js":122,"../components/Multiply.js":135,"../components/Repeater.js":147,"../components/SecondsToSamples.js":151,"../components/Sum.js":158}],242:[function(require,module,exports){
const config = require("../config.js")
const Patch = require("../Patch.js")
const MidiOsc = require("../patches/MidiOsc")
const Ramp = require("../components/Ramp.js")
const Multiply = require("../components/Multiply.js")
const Shape = require("../components/Shape")

function SineBoop(p, duration) {
  Patch.call(this)


  this.addUnits(
    this.osc = new MidiOsc(p),
    this.ramp = new Shape("decay", duration),
    this.multiply = new Multiply(this.ramp, this.osc.OUT),
  )

  this.alias(this.osc.P, "p")
  this.alias(this.ramp.DURATION)
  this.alias(this.multiply.OUT)
  //this.alias(this.ramp.T)

  console.log(this.ramp.print)

  this.P = p || 60
  this.DURATION = duration || 1
}
SineBoop.prototype = Object.create(Patch.prototype)
SineBoop.prototype.constructor = SineBoop
module.exports = SineBoop

SineBoop.randomTwinkle = function(maxDuration) {
  var boop = new SineBoop()
  boop.P = 100 + Math.random()*37
  boop.ramp.randomDecay(maxDuration || 1)
  return boop
}

SineBoop.prototype.trigger = function() {
  this.ramp.trigger()
  this.osc.phase = 0
  return this
}

},{"../Patch.js":105,"../components/Multiply.js":135,"../components/Ramp.js":145,"../components/Shape":153,"../config.js":177,"../patches/MidiOsc":236}],243:[function(require,module,exports){
const Patch = require("../Patch.js")
const OrbittySine = require("./OrbittySine.js")
const Mixer = require("./Mixer.js")
const Repeater = require("../components/Repeater.js")
const Multiply = require("../components/Multiply.js")

function SineCloud(f, speed, r, centre) {
  Patch.call(this)

  this.addUnits(
    this.mixer = new Mixer(),
    this.frequencyRepeater = new Repeater(1),
    this.speedRepeater = new Repeater(1),
    this.radiusRepeater = new Repeater(1),
    this.centreRepeater = new Repeater([0,0]),
  )
  this.orbittySines = []

  this.aliasInlet(this.frequencyRepeater.IN, "f")
  this.aliasInlet(this.speedRepeater.IN, "speed")
  this.aliasInlet(this.radiusRepeater.IN, "r")
  this.aliasInlet(this.centreRepeater.IN, "centre")
  this.aliasOutlet(this.mixer.OUT)

  this.F = f || 1
  this.SPEED = speed || 1
  this.R = r || 1
  this.CENTRE = centre || [0,0]
}
SineCloud.prototype = Object.create(Patch.prototype)
SineCloud.prototype.constructor = SineCloud
module.exports = SineCloud

SineCloud.prototype.addSine = function(f, speed, r) {
  var sine = new OrbittySine(
    new Multiply(f || 1, this.frequencyRepeater),
    new Multiply(speed || 1, this.speedRepeater),
    new Multiply(r || 1, this.radiusRepeater),
    this.centreRepeater,
  )
  this.addUnit(sine)
  this.mixer.addInput(sine)

  this.orbittySines.push(sine)

  return this
}

SineCloud.prototype.__defineSetter__("waveform", function(waveform) {
  for(var i in this.orbittySines)
    this.orbittySines[i].waveform = waveform
})

},{"../Patch.js":105,"../components/Multiply.js":135,"../components/Repeater.js":147,"./Mixer.js":237,"./OrbittySine.js":239}],244:[function(require,module,exports){
const Patch = require("../Patch.js")
const SpaceChannel = require("./SpaceChannel.js")
const PickChannel = require("../components/PickChannel.js")
const ConcatChannels = require("../components/ConcatChannels.js")
const Repeater = require("../components/Repeater.js")
const config = require("../config.js")

function Space(input, place) {
  Patch.call(this)

  this.addUnits(
    this.signalIn = new Repeater(),
    this.placementIn = new Repeater(),
    this.outRepeater = new Repeater(),
  )
  this.spaceChannels = []

  this.alias(this.signalIn.IN)
  this.alias(this.placementIn.IN, "placement")
  this.alias(this.outRepeater.OUT)

  this.IN = input || 0
  this.PLACEMENT = place || [0, 0]

  switch(config.channelFormat) {

    case "stereo":
      this.addSpeaker([-1, 0])
      this.addSpeaker([1,0])
      break;

    case "surround":
      this.addSpeaker([-1, 1])
      this.addSpeaker([1,1])
      this.addSpeaker([0, Math.sqrt(2)])
      this.addSpeaker([0,0])
      this.addSpeaker([-1,-1])
      this.addSpeaker([1,-1])
      break;
  }
}
Space.prototype = Object.create(Patch.prototype)
Space.prototype.constructor = Space
module.exports = Space

Space.stereo = function(input, place) {
  var space = new Space(input, place)
  space.addSpeaker([-1, 0])
  space.addSpeaker([ 1, 0])
  return space
}

Space.prototype.addSpeaker = function(speakerPosition) {
  var chan = new SpaceChannel()
  chan.SPEAKERPOSITION = speakerPosition
  chan.PLACEMENT = this.placementIn.OUT
  chan.IN = this.signalIn //new PickChannel(this.signalIn, this.spaceChannels.length)
  if(this.outRepeater.IN.connected)
    this.outRepeater.IN = new ConcatChannels(this.outRepeater.IN.outlet, chan)
  else
    this.outRepeater.IN = chan
  this.spaceChannels.push(chan)
  this.addUnit(chan)
}

},{"../Patch.js":105,"../components/ConcatChannels.js":119,"../components/PickChannel.js":142,"../components/Repeater.js":147,"../config.js":177,"./SpaceChannel.js":246}],245:[function(require,module,exports){
const Patch = require("../Patch.js")
const config = require("../config.js")

const MidiToFrequency = require("../components/MidiToFrequency.js")
const Osc = require("../components/Osc")
const Shape = require("../components/Shape")
const Multiply = require("../components/Multiply.js")
const Space = require("../patches/Space.js")
const Divide = require("../components/Divide.js")

function SpaceBoop(p, waveform, d, decayForm, place) {
  Patch.call(this)

  this.addUnits(
    this.mToF = new MidiToFrequency(),
    this.osc = new Osc(this.mToF),
    this.durationToRate = new Divide(1/config.sampleRate),
    this.envelope = new Shape("decay", this.durationToRate),
    this.envelopeAttenuator = new Multiply(this.osc, this.envelope),
    this.space = new Space(this.envelopeAttenuator.OUT),
  )

  this.aliasInlet(this.mToF.MIDI, "p")
  this.aliasInlet(this.space.PLACEMENT, "placement")
  this.aliasInlet(this.durationToRate.B, "duration")
  this.aliasOutlet(this.space.OUT)

  this.P = p || 60
  this.PLACEMENT = place || [0, 0]
  this.DURATION = d || 1
  this.waveform = waveform || "sin"
  this.decayForm = decayForm || "decay"
}
SpaceBoop.prototype = Object.create(Patch.prototype)
SpaceBoop.prototype.constructor = SpaceBoop
module.exports = SpaceBoop

SpaceBoop.prototype.trigger = function(pitch, duration) {
  if(pitch)
    this.P = pitch
  if(duration)
    this.DURATION = duration
  this.osc.phase = 0
  this.envelope.trigger()
}

SpaceBoop.prototype.__defineGetter__("waveform", function() {
  return this.osc.waveform
})
SpaceBoop.prototype.__defineSetter__("waveform", function(waveform) {
  this.osc.waveform = waveform
})
SpaceBoop.prototype.__defineGetter__("decayForm", function() {
  return this.envelope.shape
})
SpaceBoop.prototype.__defineSetter__("decayForm", function(shape) {
  this.envelope.shape = shape
})

},{"../Patch.js":105,"../components/Divide.js":123,"../components/MidiToFrequency.js":132,"../components/Multiply.js":135,"../components/Osc":139,"../components/Shape":153,"../config.js":177,"../patches/Space.js":244}],246:[function(require,module,exports){
const Patch = require("../Patch.js")
const Subtract = require("../components/Subtract.js")
const VectorMagnitude = require("../components/VectorMagnitude.js")
const Multiply = require("../components/Multiply.js")
const Gain = require("../components/Gain.js")
const MonoDelay = require("../components/MonoDelay.js")
const config = require("../config.js")

function SpaceChannel(speakerPosition) {
  Patch.call(this)

  // make units
  this.addUnits(
    this.speakerPositionSubtracter = new Subtract(),
    this.distanceCalculator = new VectorMagnitude(),
    this.attenuationScaler = new Multiply(),
    this.delayScaler = new Multiply(),
    this.delayer = new MonoDelay(),
    this.attenuator = new Gain(),
  )

  // make connections
  this.distanceCalculator.IN = this.speakerPositionSubtracter.OUT
  this.attenuationScaler.A = this.distanceCalculator.OUT
  this.delayScaler.A = this.distanceCalculator.OUT
  this.attenuator.GAIN = this.attenuationScaler.OUT
  this.delayer.DELAY = this.delayScaler.OUT
  this.delayer.IN = this.attenuator.OUT

  // aliasing
  this.aliasInlet(this.attenuator.IN)
  this.aliasInlet(this.speakerPositionSubtracter.A, "placement")
  this.aliasInlet(this.speakerPositionSubtracter.B, "speakerPosition")
  this.aliasInlet(this.attenuationScaler.B, "decibelsPerMeter")
  this.aliasInlet(this.delayScaler.B, "sampleDelayPerMeter")
  this.aliasOutlet(this.delayer.OUT)

  // defaults
  this.IN = 0
  this.PLACEMENT = [0,0]
  this.SPEAKERPOSITION = speakerPosition || [0,0]
  this.DECIBELSPERMETER = -3
  this.SAMPLEDELAYPERMETER = config.sampleRate / 343
}
SpaceChannel.prototype = Object.create(Patch.prototype)
SpaceChannel.prototype.constructor = SpaceChannel
module.exports = SpaceChannel

},{"../Patch.js":105,"../components/Gain.js":127,"../components/MonoDelay.js":134,"../components/Multiply.js":135,"../components/Subtract.js":157,"../components/VectorMagnitude.js":160,"../config.js":177}],247:[function(require,module,exports){
const Patch = require("../Patch.js")
const Multiply = require("../components/Multiply.js")
const quick = require("../quick.js")

function StereoDetune(input, ammount) {
  Patch.call(this)

  ammount = ammount || 0.1*Math.random()

  var ratioL = quick.semitoneToRatio(ammount)
  var ratioR = quick.divide(1, ratioL)
  var ratios = quick.concat(ratioL, ratioR)

  this.addUnits(
    this.mult = new Multiply(input, ratios)
  )

  this.alias(this.mult.A, "in")
  this.alias(this.mult.OUT)
}
StereoDetune.prototype = Object.create(Patch.prototype)
StereoDetune.prototype.constructor = StereoDetune
module.exports = StereoDetune

StereoDetune.random = function(input, maxAmmount) {
  maxAmmount = maxAmmount || 0.1
  var ammount = quick.multiply(maxAmmount, Math.random())
  return new StereoDetune(input, ammount)
}

},{"../Patch.js":105,"../components/Multiply.js":135,"../quick.js":254}],248:[function(require,module,exports){
const Patch = require("../Patch.js")
const Osc = require("../components/Osc")
const Pan = require("../components/Pan.js")
const Gain = require("../components/Gain.js")
const MidiToFrequency = require("../components/MidiToFrequency.js")
const Sum = require("../components/Sum.js")


function StereoOsc(p, gain, pan) {
  Patch.call(this)

  var sum1 = new Sum()
  this.alias(sum1.A, "p")
  this.alias(sum1.B, "pControl")

  var mToF1 = new MidiToFrequency(sum1)

  var osc1 = new Osc()
  osc1.F = mToF1.FREQUENCY
  this.osc = osc1

  var gain1 = new Gain()
  gain1.IN = osc1
  this.alias(gain1.GAIN)

  var pan1 = new Pan()
  pan1.IN = gain1.OUT
  this.alias(pan1.PAN)
  this.alias(pan1.OUT)

  this.addUnit(sum1, mToF1, osc1, gain1, pan1)

  this.GAIN = gain || 0
  this.PAN = pan || 0
  this.P = p || 60
  this.PCONTROL = 0
}
StereoOsc.prototype = Object.create(Patch.prototype)
StereoOsc.prototype.constructor = StereoOsc
module.exports = StereoOsc

StereoOsc.prototype.trigger = function() {
  this.osc.phase = 0
}

StereoOsc.prototype.__defineGetter__("waveform", function() {
  return this.osc.waveform
})
StereoOsc.prototype.__defineSetter__("waveform", function(waveform) {
  this.osc.waveform = waveform
})

},{"../Patch.js":105,"../components/Gain.js":127,"../components/MidiToFrequency.js":132,"../components/Osc":139,"../components/Pan.js":141,"../components/Sum.js":158}],249:[function(require,module,exports){
const Patch = require("../Patch.js")

class Synth extends Patch {
  constructor() {
    super()

    this.triggerList = []
  }

  trigger(p, note) {
    if(this._trigger)
      this._trigger(p, note)

    if(this.triggerList)
      for(var i in this.triggerList)
        this.triggerList[i].trigger()

    return this
  }

  addEnvelope(env) {
    if(env.isOutlet)
      env = env.unit
    this.triggerList.push(env)
    return env
  }
}
module.exports = Synth

},{"../Patch.js":105}],250:[function(require,module,exports){
const Patch = require("../Patch.js")
const Mixer = require("./Mixer.js")

function TriggerGroup() {
  Patch.call(this)

  this.addUnits(
    this.mixer = new Mixer()
  )
  this.triggers = {}

  this.aliasOutlet(this.mixer.OUT)
}
TriggerGroup.prototype = Object.create(Patch.prototype)
TriggerGroup.prototype.constructor = TriggerGroup
module.exports = TriggerGroup

TriggerGroup.prototype.addTrigger = function(trigger, name) {
  if(name == undefined) {
    name = 0
    while(this.triggers[name] != undefined)
      name++
  }
  this.triggers[name] = trigger
  this.mixer.addInput(trigger)
}

TriggerGroup.prototype.trigger = function(which) {
  if(this.triggers[which])
    this.triggers[which].trigger()
  else if(this.handleUnknownTrigger)
    this.handleUnknownTrigger(which)
  else
    console.log(this.label, "unknown trigger:", which)
}

},{"../Patch.js":105,"./Mixer.js":237}],251:[function(require,module,exports){
const Patch = require("../Patch.js")
const Noise = require("../components/Noise")
const Filter = require("../components/Filter.js")
const Repeater = require("../components/Repeater.js")
const quick = require("../quick.js")

class Worm extends Patch {
  constructor(f=1) {
    super()

    this.addUnits(
      this.noise = new Noise(),
      this.filter = new Filter(this.noise, f)
    )

    this.aliasInlet(this.filter.F)
    this.aliasOutlet(this.filter.OUT)

    this.F = f
  }

  static random(fMax = 5) {
    var f = quick.multiply(fMax, Math.random())
    return new Worm(f)
  }
}
module.exports = Worm

},{"../Patch.js":105,"../components/Filter.js":124,"../components/Noise":136,"../components/Repeater.js":147,"../quick.js":254}],252:[function(require,module,exports){
module.exports = {
	APStack: require("./APStack.js"),
	APWeb: require("./APWeb.js"),
	AttenuationMatrix: require("./AttenuationMatrix.js"),
	BandFilter: require("./BandFilter.js"),
	Boop: require("./Boop.js"),
	ComplexOrbit: require("./ComplexOrbit.js"),
	DelayMixer: require("./DelayMixer.js"),
	FMOsc: require("./FMOsc.js"),
	FMSynth: require("./FMSynth.js"),
	FrequencyGroup: require("./FrequencyGroup.js"),
	HardBandPass: require("./HardBandPass.js"),
	Karplus: require("./Karplus.js"),
	LFO: require("./LFO.js"),
	ManyOsc: require("./ManyOsc.js"),
	MidiOsc: require("./MidiOsc.js"),
	Mixer: require("./Mixer.js"),
	MultiTapDelay: require("./MultiTapDelay.js"),
	OrbittySine: require("./OrbittySine.js"),
	ScaryPatch: require("./ScaryPatch.js"),
	SimpleDelay: require("./SimpleDelay.js"),
	SineBoop: require("./SineBoop.js"),
	SineCloud: require("./SineCloud.js"),
	Space: require("./Space.js"),
	SpaceBoop: require("./SpaceBoop.js"),
	SpaceChannel: require("./SpaceChannel.js"),
	StereoDetune: require("./StereoDetune.js"),
	StereoOsc: require("./StereoOsc.js"),
	Synth: require("./Synth.js"),
	TriggerGroup: require("./TriggerGroup.js"),
	Worm: require("./Worm.js")
}
},{"./APStack.js":222,"./APWeb.js":223,"./AttenuationMatrix.js":224,"./BandFilter.js":225,"./Boop.js":226,"./ComplexOrbit.js":227,"./DelayMixer.js":228,"./FMOsc.js":229,"./FMSynth.js":230,"./FrequencyGroup.js":231,"./HardBandPass.js":232,"./Karplus.js":233,"./LFO.js":234,"./ManyOsc.js":235,"./MidiOsc.js":236,"./Mixer.js":237,"./MultiTapDelay.js":238,"./OrbittySine.js":239,"./ScaryPatch.js":240,"./SimpleDelay.js":241,"./SineBoop.js":242,"./SineCloud.js":243,"./Space.js":244,"./SpaceBoop.js":245,"./SpaceChannel.js":246,"./StereoDetune.js":247,"./StereoOsc.js":248,"./Synth.js":249,"./TriggerGroup.js":250,"./Worm.js":251}],253:[function(require,module,exports){
const patches = require("./patches")
const components = require("./components")

for(var name in patches)
  if(components[name])
    console.warn("A component and a patch with a common name:", name, "\nthe component will be overwritten")

Object.assign(exports, components, patches)

},{"./components":161,"./patches":252}],254:[function(require,module,exports){
/* quick.js provides a set of operators for combining numbers or signals making
  efficiency savings where possible */

const Sum = require("./components/Sum.js")
const Subtract = require("./components/Subtract.js")
const Multiply = require("./components/Multiply.js")
const Divide = require("./components/Divide.js")
const PolarityInvert = require("./components/PolarityInvert.js")
const SemitoneToRatio = require("./components/SemitoneToRatio.js")
const ConcatChannels = require("./components/ConcatChannels.js")
const Pow = require("./components/Pow.js")
const HardClipAbove = require("./components/HardClipAbove.js")
const HardClipBelow = require("./components/HardClipBelow.js")
const Mixer = require('./patches/Mixer')

exports.add = function quickSum(a,b) {
  if(a.constructor == Number && b.constructor == Number)
    return a + b
  else
    return new Sum(a, b)
}
exports.sum = exports.add

exports.subtract = function quickSubtract(a,b) {
  if(a.constructor == Number && b.constructor == Number)
    return a - b
  else
    return new Subtract(a, b)
}

exports.mult = function quickMultiply(a, b) {
  if(a == undefined || a == null || a == 1)
    return b
  if(b == undefined || b == null || b == 1)
    return a
  if(a.constructor == Number && b.constructor == Number)
    return a * b
  else
    return new Multiply(a, b)
}
exports.multiply = exports.mult

exports.divide = function(a, b) {
  if(a.constructor == Number && b.constructor == Number)
    return a/b
  else
    return new Divide(a, b)
}

exports.invert = function(a) {
  if(a.constructor == Number)
    return -a
  else
    return new PolarityInvert(a)
}

exports.semitoneToRatio = function(p) {
  if(p.constructor == Number)
    return Math.pow(2, p/12);
  else
    return new SemitoneToRatio(p)
}
exports.pToF = function(p) {
  if(p.constructor == Number) {
    return Math.pow(2, (p-69)/12) * 440
  } else
    throw "quick.pToF(non number) has not been implemented"
}

exports.concat = function(a, b) {
  if(a.isUnitOrPatch || a.isOutlet || b.isUnitOrPatch || b.isOutlet)
    return new ConcatChannels(a, b)
  else
    return [].concat(a, b)
}

exports.pow = function(a, b) {
  if(a.isUnitOrPatch || a.isOutlet || b.isUnitOrPatch || b.isOutlet)
    return new Pow(a,b)
  else
    return Math.pow(a, b)
}

exports.clipAbove = function(input, threshold) {
  if(input.isUnitOrPatch || input.isOutlet || threshold.isUnitOrPatch || threshold.isOutlet)
    return new HardClipAbove(input, threshold)
  else // assume numbers
    if(input > threshold)
      return threshold
    else
      return input
}

exports.clipBelow = function(input, threshold) {
  if(input.isUnitOrPatch || input.isOutlet || threshold.isUnitOrPatch || threshold.isOutlet)
    return new HardClipBelow(input, threshold)
  else // assume numbers
    if(input < threshold)
      return threshold
    else
      return input
}

exports.clip = function(input, threshold) {
  if(input.isUnitOrPatch || input.isOutlet || threshold.isUnitOrPatch || threshold.isOutlet)
    return new Clip(input, threshold)
  else // assume numbers
    if(Math.abs(input) < Math.abs(threshold))
      return threshold
    else
      return input
}

exports.mix = function(...inputs) {
  return new Mixer(...inputs)
}

},{"./components/ConcatChannels.js":119,"./components/Divide.js":123,"./components/HardClipAbove.js":129,"./components/HardClipBelow.js":130,"./components/Multiply.js":135,"./components/PolarityInvert.js":143,"./components/Pow.js":144,"./components/SemitoneToRatio.js":152,"./components/Subtract.js":157,"./components/Sum.js":158,"./patches/Mixer":237}],255:[function(require,module,exports){
const AudioBuffer = require('audio-buffer')
const Circuit = require('./Circuit')

// render audio into an channelData (array of typed arrays)
async function renderChannelData(outlet,
                                 duration=1,
                                 { TypedArray = Float32Array,
                                   normalise = false, // (unimplemented)
                                   audioctx = null,
                                 } = {}) {
  // check arguments
  if(!outlet)
    throw "renderAudioBuffer expects an outlet"
  if(outlet.isUnit || outlet.isPatch)
    outlet = outlet.defaultOutlet
  if(!outlet.isOutlet)
    throw "renderAudioBuffer expects an outlet"

  // find or construct the circuit
  const circuit = outlet.unit.circuit || new Circuit(outlet.unit)
  circuit.centralUnits = [outlet.unit]

  // get values
  const sampleRate = outlet.sampleRate
  const lengthInSamples = duration * sampleRate
  const chunkSize = outlet.chunkSize

  const channelData = [] // record data; channelData[channel][timeInSamples]

  for(let t0=0; t0<lengthInSamples; t0+=chunkSize) {
    // "tick" the circuit
    let t1 = t0 + chunkSize
    await circuit.tickUntil(t1)

    // the output signal chunk
    let chunk = outlet.signalChunk

    // if necessary, increase numberOfChannels to accomodate signal
    while(chunk.channelData.length > channelData.length)
      channelData.push(new TypedArray(lengthInSamples))

    // record signal chunk to channelData
    for(let channel in chunk.channelData)
      for(let t=0; t<chunkSize; t++) {
        let val = chunk.channelData[channel][t]
        if(isNaN(val)) {
          let culprit = circuit.findNaNCulprit()
          console.log('NaN culprit:', culprit.label)
          throw 'cannot record NaN value'
        }
        channelData[channel][t+t0] = val || 0
      }
  }

  channelData.sampleRate = sampleRate
  return channelData
}

module.exports = renderChannelData

},{"./Circuit":100,"audio-buffer":91}],256:[function(require,module,exports){
const constructExpression = require("./construct/constructExpression.js")
//const parseExpression = require("./parseDSP/getExpression.js")

function unDusp(o) {
  if(o === null)
    return null
  if(o === undefined)
    return undefined
  if(o.constructor == String)
    return constructExpression(o)

  if(o.constructor == Number)
    return o
  if(o.isUnit || o.isOutlet || o.isPatch)
    return o
}
module.exports = unDusp

},{"./construct/constructExpression.js":178}],257:[function(require,module,exports){
const unDusp = require("../unDusp")
const renderAudioBuffer = require('./renderAudioBuffer')
const DOTGraph = require('../DOTGraph')

const openBracketReg = /[\[\(\{]/

class DuspPlayer {
  constructor(str) {
    this.nowPlayingSource = null
    this.ctx = new AudioContext
    this.creationStamp = 'dusp-' + new Date().getTime()

    this.htmlInterface()

    if(str)
      this.saveStr = str

    this.updateGraph()
    this.save()
  }

  async play(loop=false) {
    this.stop()

    let duspStr = this.interface.dusp.value
    let duration = parseDuration(this.interface.duration.value)

    let outlet = unDusp(duspStr)
    if(!outlet)
      throw "Error in the dusp"

    let buffer = await renderAudioBuffer(outlet, duration)

    let source = this.ctx.createBufferSource()
    source.buffer = buffer
    source.loop = loop
    source.connect(this.ctx.destination)
    source.start()
    source.onended = () => {
      if(this.nowPlayingSource == source)
        this.stop()
    }

    console.log('playing', buffer, source)

    this.nowPlayingSource = source
    this.looping = loop

    this.updateButtons()
    this.updateGraph()
  }

  stop() {
    if(this.nowPlayingSource)
      this.nowPlayingSource.stop()
    this.nowPlayingSource = null
    this.looping = null
    this.updateButtons()
  }

  get saveStr() {
    return JSON.stringify({
      duspStr: this.interface.dusp.value,
      duration: parseDuration(this.interface.duration.value),
      creationStamp: this.creationStamp,
    })
  }

  set saveStr(str) {
    let ob = JSON.parse(str)
    this.interface.dusp.value = ob.duspStr
    this.interface.duration.value = formatDuration(ob.duration)
    this.creationStamp = ob.creationStamp
  }

  save() {
    window.localStorage.setItem(this.creationStamp, this.saveStr)
  }

  close() {
    this.stop()
    if(this.saveTimer)
      clearInterval(this.saveTimer)
    window.localStorage.removeItem(this.creationStamp)
    this.interface.main.parentNode.parentNode.removeChild(this.interface.main.parentNode)
  }

  htmlInterface() {
    if(!document)
      throw "DuspPlayer cannot generate HTML interface outside of browser"
    if(this.interface)
      return this.interface

    let mainDIV = document.createElement('div')
    mainDIV.addEventListener('keydown', (e) => {
      if(e.metaKey && e.keyCode == 13) {
        this.play(e.shiftKey)
      } else if(e.keyCode == 27) {
        this.stop()
        if(e.metaKey) {
          this.close()
        }
      } else {
        this.save()
      }
    })
    mainDIV.className = 'DuspPlayer'



    let inputWrapperDIV = document.createElement('div')
    inputWrapperDIV.className = 'inputwrapper'
    mainDIV.appendChild(inputWrapperDIV)

    let duspINPUT = document.createElement('textarea')
    duspINPUT.onchange = () => this.updateGraph()
    duspINPUT.addEventListener('keydown', function(e) {
      if(e.keyCode == 9) {
        // TAB
        e.preventDefault()
        var s = this.selectionStart;
        this.value = this.value.substring(0,this.selectionStart) + "  " + this.value.substring(this.selectionEnd);
        this.selectionEnd = s+2;
      }

      if(e.key == '(') {
        e.preventDefault()
        let s = this.selectionStart
        let t = this.selectionEnd
        this.value = this.value.substring(0, s) +
          '(' + this.value.substring(s,t) +
          ')' + this.value.substring(t)

        this.setSelectionRange(s+1, t+1)
      }

      if(e.key == '[' && (
        this.selectionStart!=this.selectionEnd || this.value[this.selectionEnd] == '\n'
      )) {
        e.preventDefault()
        let s = this.selectionStart
        let t = this.selectionEnd
        this.value = this.value.substring(0, s) +
          '[' + this.value.substring(s,t) +
          ']' + this.value.substring(t)

        this.setSelectionRange(s+1, t+1)
      }
      if(e.key == '\"') {
        e.preventDefault()
        let s = this.selectionStart
        let t = this.selectionEnd
        this.value = this.value.substring(0, s) +
          '"' + this.value.substring(s,t) +
          '"' + this.value.substring(t)

        this.setSelectionRange(s+1, t+1)
      }

      if(e.keyCode == 8) {
        // backspace

      }

      if(e.keyCode == 13 && !e.metaKey) {
        e.preventDefault()
        let s = this.selectionStart;
        let t = this.selectionEnd

        let before = this.value.substring(0,s)
        let line = before.slice(before.lastIndexOf('\n'))
        let nSpace = 0
        for(let i=before.lastIndexOf('\n')+1; i<before.length; i++, nSpace++)
          if(before[i] != ' ')
            break

        if(openBracketReg.test(before[before.length-1]))
          nSpace += 2

        let tabs = ' '.repeat(nSpace)
        this.value = before + '\n' + tabs + this.value.substring(t)
        this.selectionEnd = s+1+tabs.length
      }
    })
    duspINPUT.value = 'O200'
    inputWrapperDIV.appendChild(duspINPUT)

    let canvasWrapper = document.createElement('div')
    canvasWrapper.className = 'graph_wrapper'
    mainDIV.appendChild(canvasWrapper)

    let controlDIV = document.createElement('div')
    controlDIV.className = 'controls'
    mainDIV.appendChild(controlDIV)

    let playBTN = document.createElement('button')
    playBTN.innerText = 'play'
    playBTN.onclick = () => this.play(false)
    controlDIV.appendChild(playBTN)

    let stopBTN = document.createElement('button')
    stopBTN.innerText = 'stop'
    stopBTN.onclick = () => this.stop()
    controlDIV.appendChild(stopBTN)

    let loopBTN = document.createElement('button')
    loopBTN.innerText = 'play looped'
    loopBTN.onclick = () => this.play(true)
    controlDIV.appendChild(loopBTN)

    let durationLABEL = document.createElement('label')
    durationLABEL.innerText = 'duration:'
    controlDIV.appendChild(durationLABEL)

    let durationINPUT = document.createElement('input')
    durationINPUT.className = 'duration'
    durationINPUT.value = formatDuration(5)
    durationINPUT.onclick = function() {
      this.setSelectionRange(0, this.value.length)
    }
    durationINPUT.onblur = () => {
      durationINPUT.value = formatDuration(parseDuration(durationINPUT.value))
    }
    controlDIV.appendChild(durationINPUT)

    let closeBTN = document.createElement('button')
    closeBTN.onclick = () => this.close()
    closeBTN.innerText = 'discard'
    closeBTN.className = 'close'
    controlDIV.appendChild(closeBTN)

    this.interface = {
      main: mainDIV,
      dusp: duspINPUT,
      duration: durationINPUT,
      play: playBTN,
      loop: loopBTN,
      stop: stopBTN,
      canvasWrapper: canvasWrapper,
    }

    this.updateButtons()

    return this.interface.main
  }

  updateGraph() {
    if(this.interface) {
      this.interface.canvasWrapper.innerHTML = ''
      let duspStr = this.interface.dusp.value
      let outlet = unDusp(duspStr)
      DOTGraph.render(this.interface.canvasWrapper, outlet)
    }
  }

  updateButtons() {
    this.interface.play.className = 'inactive'
    this.interface.loop.className = 'inactive'
    this.interface.stop.className = 'inactive'
    if(this.nowPlayingSource) {
      if(this.looping)
        this.interface.loop.className = 'active'
      else
        this.interface.play.className = 'active'
    } else
      this.interface.stop.className = 'active'
  }
}
module.exports = DuspPlayer

function parseDuration(str) {
  let parts = str.split(':')
  if(parts.length == 2) {
    let minutes = parseInt(parts[0]) || 0
    let seconds = parseFloat(parts[1]) || 0
    return minutes*60 + seconds
  } else if(parts.length == 1) {
    return parseFloat(parts[0])
  }
}
function formatDuration(seconds) {
  let minutes = Math.floor(seconds/60).toString()
  if(minutes.length == 1)
    minutes = '0'+minutes
  seconds -= minutes * 60
  seconds = (Math.abs(seconds) < 10 ? '0' : '') + seconds.toFixed(3)
  return minutes + ":" + seconds
}

},{"../DOTGraph":101,"../unDusp":256,"./renderAudioBuffer":260}],258:[function(require,module,exports){
const AudioBuffer = require('audio-buffer')

function channelDataToAudioBuffer(channelData) {
  let audioBuffer = new AudioBuffer({
    sampleRate: channelData.sampleRate,
    numberOfChannels: channelData.length,
    length: channelData[0].length,
  })

  for(let c=0; c<channelData.length; c++) {
    audioBuffer.copyToChannel(channelData[c], c)
  }

  return audioBuffer
}
module.exports = channelDataToAudioBuffer

},{"audio-buffer":91}],259:[function(require,module,exports){
const RenderStream = require("../RenderStream")
const WritableWAA = require('web-audio-stream/writable')

function connectToWAA(outlet, destination) {
  // stream an outlet into a Web Audio API destination
  console.log('nc', outlet.numberOfChannels)
  if(outlet.numberOfChannels != 1)
    console.warn('streaming multichannel ('+outlet.numberOfChannels+') outlet to WAA')

  let writable = WritableWAA(destination, {
    context: destination.context,
    channels: outlet.numberOfChannels,
    sampleRate: outlet.sampleRate,
    samplesPerFrame: outlet.chunkSize,

    mode: WritableWAA.SCRIPT_MODE,

    autoend: true,
  })

  let renderStream = new RenderStream(outlet, outlet.numberOfChannels)
  renderStream.pipe(writable)

  return renderStream
}
module.exports = connectToWAA

},{"../RenderStream":107,"web-audio-stream/writable":297}],260:[function(require,module,exports){
const renderChannelData = require('../renderChannelData')
const channelDataToAudioBuffer = require('./channelDataToAudioBuffer')

async function renderAudioBuffer(outlet, duration, options={}) {
  let channelData = await renderChannelData(outlet, duration, options)
  return channelDataToAudioBuffer(channelData)
}
module.exports = renderAudioBuffer

},{"../renderChannelData":255,"./channelDataToAudioBuffer":258}],261:[function(require,module,exports){
/**
 * @module entity-game
 */

module.exports = require('../../../../english-io/src/index.js')

},{"../../../../english-io/src/index.js":38}],262:[function(require,module,exports){
'use strict';

function FFT(size) {
  this.size = size | 0;
  if (this.size <= 1 || (this.size & (this.size - 1)) !== 0)
    throw new Error('FFT size must be a power of two and bigger than 1');

  this._csize = size << 1;

  // NOTE: Use of `var` is intentional for old V8 versions
  var table = new Array(this.size * 2);
  for (var i = 0; i < table.length; i += 2) {
    const angle = Math.PI * i / this.size;
    table[i] = Math.cos(angle);
    table[i + 1] = -Math.sin(angle);
  }
  this.table = table;

  // Find size's power of two
  var power = 0;
  for (var t = 1; this.size > t; t <<= 1)
    power++;

  // Calculate initial step's width:
  //   * If we are full radix-4 - it is 2x smaller to give inital len=8
  //   * Otherwise it is the same as `power` to give len=4
  this._width = power % 2 === 0 ? power - 1 : power;

  // Pre-compute bit-reversal patterns
  this._bitrev = new Array(1 << this._width);
  for (var j = 0; j < this._bitrev.length; j++) {
    this._bitrev[j] = 0;
    for (var shift = 0; shift < this._width; shift += 2) {
      var revShift = this._width - shift - 2;
      this._bitrev[j] |= ((j >>> shift) & 3) << revShift;
    }
  }

  this._out = null;
  this._data = null;
  this._inv = 0;
}
module.exports = FFT;

FFT.prototype.fromComplexArray = function fromComplexArray(complex, storage) {
  var res = storage || new Array(complex.length >>> 1);
  for (var i = 0; i < complex.length; i += 2)
    res[i >>> 1] = complex[i];
  return res;
};

FFT.prototype.createComplexArray = function createComplexArray() {
  const res = new Array(this._csize);
  for (var i = 0; i < res.length; i++)
    res[i] = 0;
  return res;
};

FFT.prototype.toComplexArray = function toComplexArray(input, storage) {
  var res = storage || this.createComplexArray();
  for (var i = 0; i < res.length; i += 2) {
    res[i] = input[i >>> 1];
    res[i + 1] = 0;
  }
  return res;
};

FFT.prototype.completeSpectrum = function completeSpectrum(spectrum) {
  var size = this._csize;
  var half = size >>> 1;
  for (var i = 2; i < half; i += 2) {
    spectrum[size - i] = spectrum[i];
    spectrum[size - i + 1] = -spectrum[i + 1];
  }
};

FFT.prototype.transform = function transform(out, data) {
  if (out === data)
    throw new Error('Input and output buffers must be different');

  this._out = out;
  this._data = data;
  this._inv = 0;
  this._transform4();
  this._out = null;
  this._data = null;
};

FFT.prototype.realTransform = function realTransform(out, data) {
  if (out === data)
    throw new Error('Input and output buffers must be different');

  this._out = out;
  this._data = data;
  this._inv = 0;
  this._realTransform4();
  this._out = null;
  this._data = null;
};

FFT.prototype.inverseTransform = function inverseTransform(out, data) {
  if (out === data)
    throw new Error('Input and output buffers must be different');

  this._out = out;
  this._data = data;
  this._inv = 1;
  this._transform4();
  for (var i = 0; i < out.length; i++)
    out[i] /= this.size;
  this._out = null;
  this._data = null;
};

// radix-4 implementation
//
// NOTE: Uses of `var` are intentional for older V8 version that do not
// support both `let compound assignments` and `const phi`
FFT.prototype._transform4 = function _transform4() {
  var out = this._out;
  var size = this._csize;

  // Initial step (permute and transform)
  var width = this._width;
  var step = 1 << width;
  var len = (size / step) << 1;

  var outOff;
  var t;
  var bitrev = this._bitrev;
  if (len === 4) {
    for (outOff = 0, t = 0; outOff < size; outOff += len, t++) {
      const off = bitrev[t];
      this._singleTransform2(outOff, off, step);
    }
  } else {
    // len === 8
    for (outOff = 0, t = 0; outOff < size; outOff += len, t++) {
      const off = bitrev[t];
      this._singleTransform4(outOff, off, step);
    }
  }

  // Loop through steps in decreasing order
  var inv = this._inv ? -1 : 1;
  var table = this.table;
  for (step >>= 2; step >= 2; step >>= 2) {
    len = (size / step) << 1;
    var quarterLen = len >>> 2;

    // Loop through offsets in the data
    for (outOff = 0; outOff < size; outOff += len) {
      // Full case
      var limit = outOff + quarterLen;
      for (var i = outOff, k = 0; i < limit; i += 2, k += step) {
        const A = i;
        const B = A + quarterLen;
        const C = B + quarterLen;
        const D = C + quarterLen;

        // Original values
        const Ar = out[A];
        const Ai = out[A + 1];
        const Br = out[B];
        const Bi = out[B + 1];
        const Cr = out[C];
        const Ci = out[C + 1];
        const Dr = out[D];
        const Di = out[D + 1];

        // Middle values
        const MAr = Ar;
        const MAi = Ai;

        const tableBr = table[k];
        const tableBi = inv * table[k + 1];
        const MBr = Br * tableBr - Bi * tableBi;
        const MBi = Br * tableBi + Bi * tableBr;

        const tableCr = table[2 * k];
        const tableCi = inv * table[2 * k + 1];
        const MCr = Cr * tableCr - Ci * tableCi;
        const MCi = Cr * tableCi + Ci * tableCr;

        const tableDr = table[3 * k];
        const tableDi = inv * table[3 * k + 1];
        const MDr = Dr * tableDr - Di * tableDi;
        const MDi = Dr * tableDi + Di * tableDr;

        // Pre-Final values
        const T0r = MAr + MCr;
        const T0i = MAi + MCi;
        const T1r = MAr - MCr;
        const T1i = MAi - MCi;
        const T2r = MBr + MDr;
        const T2i = MBi + MDi;
        const T3r = inv * (MBr - MDr);
        const T3i = inv * (MBi - MDi);

        // Final values
        const FAr = T0r + T2r;
        const FAi = T0i + T2i;

        const FCr = T0r - T2r;
        const FCi = T0i - T2i;

        const FBr = T1r + T3i;
        const FBi = T1i - T3r;

        const FDr = T1r - T3i;
        const FDi = T1i + T3r;

        out[A] = FAr;
        out[A + 1] = FAi;
        out[B] = FBr;
        out[B + 1] = FBi;
        out[C] = FCr;
        out[C + 1] = FCi;
        out[D] = FDr;
        out[D + 1] = FDi;
      }
    }
  }
};

// radix-2 implementation
//
// NOTE: Only called for len=4
FFT.prototype._singleTransform2 = function _singleTransform2(outOff, off,
                                                             step) {
  const out = this._out;
  const data = this._data;

  const evenR = data[off];
  const evenI = data[off + 1];
  const oddR = data[off + step];
  const oddI = data[off + step + 1];

  const leftR = evenR + oddR;
  const leftI = evenI + oddI;
  const rightR = evenR - oddR;
  const rightI = evenI - oddI;

  out[outOff] = leftR;
  out[outOff + 1] = leftI;
  out[outOff + 2] = rightR;
  out[outOff + 3] = rightI;
};

// radix-4
//
// NOTE: Only called for len=8
FFT.prototype._singleTransform4 = function _singleTransform4(outOff, off,
                                                             step) {
  const out = this._out;
  const data = this._data;
  const inv = this._inv ? -1 : 1;
  const step2 = step * 2;
  const step3 = step * 3;

  // Original values
  const Ar = data[off];
  const Ai = data[off + 1];
  const Br = data[off + step];
  const Bi = data[off + step + 1];
  const Cr = data[off + step2];
  const Ci = data[off + step2 + 1];
  const Dr = data[off + step3];
  const Di = data[off + step3 + 1];

  // Pre-Final values
  const T0r = Ar + Cr;
  const T0i = Ai + Ci;
  const T1r = Ar - Cr;
  const T1i = Ai - Ci;
  const T2r = Br + Dr;
  const T2i = Bi + Di;
  const T3r = inv * (Br - Dr);
  const T3i = inv * (Bi - Di);

  // Final values
  const FAr = T0r + T2r;
  const FAi = T0i + T2i;

  const FBr = T1r + T3i;
  const FBi = T1i - T3r;

  const FCr = T0r - T2r;
  const FCi = T0i - T2i;

  const FDr = T1r - T3i;
  const FDi = T1i + T3r;

  out[outOff] = FAr;
  out[outOff + 1] = FAi;
  out[outOff + 2] = FBr;
  out[outOff + 3] = FBi;
  out[outOff + 4] = FCr;
  out[outOff + 5] = FCi;
  out[outOff + 6] = FDr;
  out[outOff + 7] = FDi;
};

// Real input radix-4 implementation
FFT.prototype._realTransform4 = function _realTransform4() {
  var out = this._out;
  var size = this._csize;

  // Initial step (permute and transform)
  var width = this._width;
  var step = 1 << width;
  var len = (size / step) << 1;

  var outOff;
  var t;
  var bitrev = this._bitrev;
  if (len === 4) {
    for (outOff = 0, t = 0; outOff < size; outOff += len, t++) {
      const off = bitrev[t];
      this._singleRealTransform2(outOff, off >>> 1, step >>> 1);
    }
  } else {
    // len === 8
    for (outOff = 0, t = 0; outOff < size; outOff += len, t++) {
      const off = bitrev[t];
      this._singleRealTransform4(outOff, off >>> 1, step >>> 1);
    }
  }

  // Loop through steps in decreasing order
  var inv = this._inv ? -1 : 1;
  var table = this.table;
  for (step >>= 2; step >= 2; step >>= 2) {
    len = (size / step) << 1;
    var halfLen = len >>> 1;
    var quarterLen = halfLen >>> 1;
    var hquarterLen = quarterLen >>> 1;

    // Loop through offsets in the data
    for (outOff = 0; outOff < size; outOff += len) {
      for (var i = 0, k = 0; i <= hquarterLen; i += 2, k += step) {
        var A = outOff + i;
        var B = A + quarterLen;
        var C = B + quarterLen;
        var D = C + quarterLen;

        // Original values
        var Ar = out[A];
        var Ai = out[A + 1];
        var Br = out[B];
        var Bi = out[B + 1];
        var Cr = out[C];
        var Ci = out[C + 1];
        var Dr = out[D];
        var Di = out[D + 1];

        // Middle values
        var MAr = Ar;
        var MAi = Ai;

        var tableBr = table[k];
        var tableBi = inv * table[k + 1];
        var MBr = Br * tableBr - Bi * tableBi;
        var MBi = Br * tableBi + Bi * tableBr;

        var tableCr = table[2 * k];
        var tableCi = inv * table[2 * k + 1];
        var MCr = Cr * tableCr - Ci * tableCi;
        var MCi = Cr * tableCi + Ci * tableCr;

        var tableDr = table[3 * k];
        var tableDi = inv * table[3 * k + 1];
        var MDr = Dr * tableDr - Di * tableDi;
        var MDi = Dr * tableDi + Di * tableDr;

        // Pre-Final values
        var T0r = MAr + MCr;
        var T0i = MAi + MCi;
        var T1r = MAr - MCr;
        var T1i = MAi - MCi;
        var T2r = MBr + MDr;
        var T2i = MBi + MDi;
        var T3r = inv * (MBr - MDr);
        var T3i = inv * (MBi - MDi);

        // Final values
        var FAr = T0r + T2r;
        var FAi = T0i + T2i;

        var FBr = T1r + T3i;
        var FBi = T1i - T3r;

        out[A] = FAr;
        out[A + 1] = FAi;
        out[B] = FBr;
        out[B + 1] = FBi;

        // Output final middle point
        if (i === 0) {
          var FCr = T0r - T2r;
          var FCi = T0i - T2i;
          out[C] = FCr;
          out[C + 1] = FCi;
          continue;
        }

        // Do not overwrite ourselves
        if (i === hquarterLen)
          continue;

        // In the flipped case:
        // MAi = -MAi
        // MBr=-MBi, MBi=-MBr
        // MCr=-MCr
        // MDr=MDi, MDi=MDr
        var ST0r = T1r;
        var ST0i = -T1i;
        var ST1r = T0r;
        var ST1i = -T0i;
        var ST2r = -inv * T3i;
        var ST2i = -inv * T3r;
        var ST3r = -inv * T2i;
        var ST3i = -inv * T2r;

        var SFAr = ST0r + ST2r;
        var SFAi = ST0i + ST2i;

        var SFBr = ST1r + ST3i;
        var SFBi = ST1i - ST3r;

        var SA = outOff + quarterLen - i;
        var SB = outOff + halfLen - i;

        out[SA] = SFAr;
        out[SA + 1] = SFAi;
        out[SB] = SFBr;
        out[SB + 1] = SFBi;
      }
    }
  }
};

// radix-2 implementation
//
// NOTE: Only called for len=4
FFT.prototype._singleRealTransform2 = function _singleRealTransform2(outOff,
                                                                     off,
                                                                     step) {
  const out = this._out;
  const data = this._data;

  const evenR = data[off];
  const oddR = data[off + step];

  const leftR = evenR + oddR;
  const rightR = evenR - oddR;

  out[outOff] = leftR;
  out[outOff + 1] = 0;
  out[outOff + 2] = rightR;
  out[outOff + 3] = 0;
};

// radix-4
//
// NOTE: Only called for len=8
FFT.prototype._singleRealTransform4 = function _singleRealTransform4(outOff,
                                                                     off,
                                                                     step) {
  const out = this._out;
  const data = this._data;
  const inv = this._inv ? -1 : 1;
  const step2 = step * 2;
  const step3 = step * 3;

  // Original values
  const Ar = data[off];
  const Br = data[off + step];
  const Cr = data[off + step2];
  const Dr = data[off + step3];

  // Pre-Final values
  const T0r = Ar + Cr;
  const T1r = Ar - Cr;
  const T2r = Br + Dr;
  const T3r = inv * (Br - Dr);

  // Final values
  const FAr = T0r + T2r;

  const FBr = T1r;
  const FBi = -T3r;

  const FCr = T0r - T2r;

  const FDr = T1r;
  const FDi = T3r;

  out[outOff] = FAr;
  out[outOff + 1] = 0;
  out[outOff + 2] = FBr;
  out[outOff + 3] = FBi;
  out[outOff + 4] = FCr;
  out[outOff + 5] = 0;
  out[outOff + 6] = FDr;
  out[outOff + 7] = FDi;
};

},{}],263:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],264:[function(require,module,exports){
/**
 * @module  is-audio-buffer
 */
'use strict';

module.exports = function isAudioBuffer (buffer) {
	//the guess is duck-typing
	return buffer != null
	&& typeof buffer.length === 'number'
	&& typeof buffer.sampleRate === 'number' //swims like AudioBuffer
	&& typeof buffer.getChannelData === 'function' //quacks like AudioBuffer
	// && buffer.copyToChannel
	// && buffer.copyFromChannel
	&& typeof buffer.duration === 'number'
};

},{}],265:[function(require,module,exports){
module.exports = true;
},{}],266:[function(require,module,exports){
/*!
 * Determine if an object is a Buffer
 *
 * @author   Feross Aboukhadijeh <https://feross.org>
 * @license  MIT
 */

// The _isBuffer check is for Safari 5-7 support, because it's missing
// Object.prototype.constructor. Remove this eventually
module.exports = function (obj) {
  return obj != null && (isBuffer(obj) || isSlowBuffer(obj) || !!obj._isBuffer)
}

function isBuffer (obj) {
  return !!obj.constructor && typeof obj.constructor.isBuffer === 'function' && obj.constructor.isBuffer(obj)
}

// For Node v0.10 support. Remove this eventually.
function isSlowBuffer (obj) {
  return typeof obj.readFloatLE === 'function' && typeof obj.slice === 'function' && isBuffer(obj.slice(0, 0))
}

},{}],267:[function(require,module,exports){
'use strict';

var re = require('data-uri-regex');

module.exports = function (data) {
	return (data && re().test(data)) === true;
};

},{"data-uri-regex":98}],268:[function(require,module,exports){
'use strict';
var toString = Object.prototype.toString;

module.exports = function (x) {
	var prototype;
	return toString.call(x) === '[object Object]' && (prototype = Object.getPrototypeOf(x), prototype === null || prototype === Object.getPrototypeOf({}));
};

},{}],269:[function(require,module,exports){
module.exports = function (args, opts) {
    if (!opts) opts = {};
    
    var flags = { bools : {}, strings : {}, unknownFn: null };

    if (typeof opts['unknown'] === 'function') {
        flags.unknownFn = opts['unknown'];
    }

    if (typeof opts['boolean'] === 'boolean' && opts['boolean']) {
      flags.allBools = true;
    } else {
      [].concat(opts['boolean']).filter(Boolean).forEach(function (key) {
          flags.bools[key] = true;
      });
    }
    
    var aliases = {};
    Object.keys(opts.alias || {}).forEach(function (key) {
        aliases[key] = [].concat(opts.alias[key]);
        aliases[key].forEach(function (x) {
            aliases[x] = [key].concat(aliases[key].filter(function (y) {
                return x !== y;
            }));
        });
    });

    [].concat(opts.string).filter(Boolean).forEach(function (key) {
        flags.strings[key] = true;
        if (aliases[key]) {
            flags.strings[aliases[key]] = true;
        }
     });

    var defaults = opts['default'] || {};
    
    var argv = { _ : [] };
    Object.keys(flags.bools).forEach(function (key) {
        setArg(key, defaults[key] === undefined ? false : defaults[key]);
    });
    
    var notFlags = [];

    if (args.indexOf('--') !== -1) {
        notFlags = args.slice(args.indexOf('--')+1);
        args = args.slice(0, args.indexOf('--'));
    }

    function argDefined(key, arg) {
        return (flags.allBools && /^--[^=]+$/.test(arg)) ||
            flags.strings[key] || flags.bools[key] || aliases[key];
    }

    function setArg (key, val, arg) {
        if (arg && flags.unknownFn && !argDefined(key, arg)) {
            if (flags.unknownFn(arg) === false) return;
        }

        var value = !flags.strings[key] && isNumber(val)
            ? Number(val) : val
        ;
        setKey(argv, key.split('.'), value);
        
        (aliases[key] || []).forEach(function (x) {
            setKey(argv, x.split('.'), value);
        });
    }

    function setKey (obj, keys, value) {
        var o = obj;
        keys.slice(0,-1).forEach(function (key) {
            if (o[key] === undefined) o[key] = {};
            o = o[key];
        });

        var key = keys[keys.length - 1];
        if (o[key] === undefined || flags.bools[key] || typeof o[key] === 'boolean') {
            o[key] = value;
        }
        else if (Array.isArray(o[key])) {
            o[key].push(value);
        }
        else {
            o[key] = [ o[key], value ];
        }
    }
    
    function aliasIsBoolean(key) {
      return aliases[key].some(function (x) {
          return flags.bools[x];
      });
    }

    for (var i = 0; i < args.length; i++) {
        var arg = args[i];
        
        if (/^--.+=/.test(arg)) {
            // Using [\s\S] instead of . because js doesn't support the
            // 'dotall' regex modifier. See:
            // http://stackoverflow.com/a/1068308/13216
            var m = arg.match(/^--([^=]+)=([\s\S]*)$/);
            var key = m[1];
            var value = m[2];
            if (flags.bools[key]) {
                value = value !== 'false';
            }
            setArg(key, value, arg);
        }
        else if (/^--no-.+/.test(arg)) {
            var key = arg.match(/^--no-(.+)/)[1];
            setArg(key, false, arg);
        }
        else if (/^--.+/.test(arg)) {
            var key = arg.match(/^--(.+)/)[1];
            var next = args[i + 1];
            if (next !== undefined && !/^-/.test(next)
            && !flags.bools[key]
            && !flags.allBools
            && (aliases[key] ? !aliasIsBoolean(key) : true)) {
                setArg(key, next, arg);
                i++;
            }
            else if (/^(true|false)$/.test(next)) {
                setArg(key, next === 'true', arg);
                i++;
            }
            else {
                setArg(key, flags.strings[key] ? '' : true, arg);
            }
        }
        else if (/^-[^-]+/.test(arg)) {
            var letters = arg.slice(1,-1).split('');
            
            var broken = false;
            for (var j = 0; j < letters.length; j++) {
                var next = arg.slice(j+2);
                
                if (next === '-') {
                    setArg(letters[j], next, arg)
                    continue;
                }
                
                if (/[A-Za-z]/.test(letters[j]) && /=/.test(next)) {
                    setArg(letters[j], next.split('=')[1], arg);
                    broken = true;
                    break;
                }
                
                if (/[A-Za-z]/.test(letters[j])
                && /-?\d+(\.\d*)?(e-?\d+)?$/.test(next)) {
                    setArg(letters[j], next, arg);
                    broken = true;
                    break;
                }
                
                if (letters[j+1] && letters[j+1].match(/\W/)) {
                    setArg(letters[j], arg.slice(j+2), arg);
                    broken = true;
                    break;
                }
                else {
                    setArg(letters[j], flags.strings[letters[j]] ? '' : true, arg);
                }
            }
            
            var key = arg.slice(-1)[0];
            if (!broken && key !== '-') {
                if (args[i+1] && !/^(-|--)[^-]/.test(args[i+1])
                && !flags.bools[key]
                && (aliases[key] ? !aliasIsBoolean(key) : true)) {
                    setArg(key, args[i+1], arg);
                    i++;
                }
                else if (args[i+1] && /true|false/.test(args[i+1])) {
                    setArg(key, args[i+1] === 'true', arg);
                    i++;
                }
                else {
                    setArg(key, flags.strings[key] ? '' : true, arg);
                }
            }
        }
        else {
            if (!flags.unknownFn || flags.unknownFn(arg) !== false) {
                argv._.push(
                    flags.strings['_'] || !isNumber(arg) ? arg : Number(arg)
                );
            }
            if (opts.stopEarly) {
                argv._.push.apply(argv._, args.slice(i + 1));
                break;
            }
        }
    }
    
    Object.keys(defaults).forEach(function (key) {
        if (!hasKey(argv, key.split('.'))) {
            setKey(argv, key.split('.'), defaults[key]);
            
            (aliases[key] || []).forEach(function (x) {
                setKey(argv, x.split('.'), defaults[key]);
            });
        }
    });
    
    if (opts['--']) {
        argv['--'] = new Array();
        notFlags.forEach(function(key) {
            argv['--'].push(key);
        });
    }
    else {
        notFlags.forEach(function(key) {
            argv._.push(key);
        });
    }

    return argv;
};

function hasKey (obj, keys) {
    var o = obj;
    keys.slice(0,-1).forEach(function (key) {
        o = (o[key] || {});
    });

    var key = keys[keys.length - 1];
    return key in o;
}

function isNumber (x) {
    if (typeof x === 'number') return true;
    if (/^0x[0-9a-f]+$/i.test(x)) return true;
    return /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(e[-+]?\d+)?$/.test(x);
}


},{}],270:[function(require,module,exports){
/** @module negative-index */
var isNeg = require('negative-zero');

module.exports = function negIdx (idx, length) {
	return idx == null ? 0 : isNeg(idx) ? length : idx <= -length ? 0 : idx < 0 ? (length + (idx % length)) : Math.min(length, idx);
}

},{"negative-zero":271}],271:[function(require,module,exports){
'use strict';
module.exports = x => Object.is(x, -0);

},{}],272:[function(require,module,exports){
/*
object-assign
(c) Sindre Sorhus
@license MIT
*/

'use strict';
/* eslint-disable no-unused-vars */
var getOwnPropertySymbols = Object.getOwnPropertySymbols;
var hasOwnProperty = Object.prototype.hasOwnProperty;
var propIsEnumerable = Object.prototype.propertyIsEnumerable;

function toObject(val) {
	if (val === null || val === undefined) {
		throw new TypeError('Object.assign cannot be called with null or undefined');
	}

	return Object(val);
}

function shouldUseNative() {
	try {
		if (!Object.assign) {
			return false;
		}

		// Detect buggy property enumeration order in older V8 versions.

		// https://bugs.chromium.org/p/v8/issues/detail?id=4118
		var test1 = new String('abc');  // eslint-disable-line no-new-wrappers
		test1[5] = 'de';
		if (Object.getOwnPropertyNames(test1)[0] === '5') {
			return false;
		}

		// https://bugs.chromium.org/p/v8/issues/detail?id=3056
		var test2 = {};
		for (var i = 0; i < 10; i++) {
			test2['_' + String.fromCharCode(i)] = i;
		}
		var order2 = Object.getOwnPropertyNames(test2).map(function (n) {
			return test2[n];
		});
		if (order2.join('') !== '0123456789') {
			return false;
		}

		// https://bugs.chromium.org/p/v8/issues/detail?id=3056
		var test3 = {};
		'abcdefghijklmnopqrst'.split('').forEach(function (letter) {
			test3[letter] = letter;
		});
		if (Object.keys(Object.assign({}, test3)).join('') !==
				'abcdefghijklmnopqrst') {
			return false;
		}

		return true;
	} catch (err) {
		// We don't expect any of the above to throw, but better to be safe.
		return false;
	}
}

module.exports = shouldUseNative() ? Object.assign : function (target, source) {
	var from;
	var to = toObject(target);
	var symbols;

	for (var s = 1; s < arguments.length; s++) {
		from = Object(arguments[s]);

		for (var key in from) {
			if (hasOwnProperty.call(from, key)) {
				to[key] = from[key];
			}
		}

		if (getOwnPropertySymbols) {
			symbols = getOwnPropertySymbols(from);
			for (var i = 0; i < symbols.length; i++) {
				if (propIsEnumerable.call(from, symbols[i])) {
					to[symbols[i]] = from[symbols[i]];
				}
			}
		}
	}

	return to;
};

},{}],273:[function(require,module,exports){
(function (Buffer){
/**
 * @module  pcm-util
 */
'use strict'

var toArrayBuffer = require('to-array-buffer')
var AudioBuffer = require('audio-buffer')
var os = require('os')
var isAudioBuffer = require('is-audio-buffer')



/**
 * Default pcm format values
 */
var defaultFormat = {
	signed: true,
	float: false,
	bitDepth: 16,
	byteOrder: os.endianness instanceof Function ? os.endianness() : 'LE',
	channels: 2,
	sampleRate: 44100,
	interleaved: true,
	samplesPerFrame: 1024,
	id: 'S_16_LE_2_44100_I',
	max: 32678,
	min: -32768
}


/**
 * Just a list of reserved property names of format
 */
var formatProperties = Object.keys(defaultFormat)


/** Correct default format values */
normalize(defaultFormat)


/**
 * Get format info from any object, unnormalized.
 */
function getFormat (obj) {
	//undefined format - no format-related props, for sure
	if (!obj) return {}

	//if is string - parse format
	if (typeof obj === 'string' || obj.id) {
		return parse(obj.id || obj)
	}

	//if audio buffer - we know it’s format
	else if (isAudioBuffer(obj)) {
		var arrayFormat = fromTypedArray(obj.getChannelData(0))
		return {
			sampleRate: obj.sampleRate,
			channels: obj.numberOfChannels,
			samplesPerFrame: obj.length,
			float: true,
			signed: true,
			bitDepth: arrayFormat.bitDepth
		}
	}

	//if is array - detect format
	else if (ArrayBuffer.isView(obj)) {
		return fromTypedArray(obj)
	}

	//FIXME: add AudioNode, stream detection

	//else detect from obhect
	return fromObject(obj)
}


/**
 * Get format id string.
 * Inspired by https://github.com/xdissent/node-alsa/blob/master/src/constants.coffee
 */
function stringify (format) {
	//TODO: extend possible special formats
	var result = []

	//(S|U)(8|16|24|32)_(LE|BE)?
	result.push(format.float ? 'F' : (format.signed ? 'S' : 'U'))
	result.push(format.bitDepth)
	result.push(format.byteOrder)
	result.push(format.channels)
	result.push(format.sampleRate)
	result.push(format.interleaved ? 'I' : 'N')

	return result.join('_')
}


/**
 * Return format object from the format ID.
 * Returned format is not normalized for performance purposes (~10 times)
 * http://jsperf.com/parse-vs-extend/4
 */
function parse (str) {
	var params = str.split('_')
	return {
		float: params[0] === 'F',
		signed: params[0] === 'S',
		bitDepth: parseInt(params[1]),
		byteOrder: params[2],
		channels: parseInt(params[3]),
		sampleRate: parseInt(params[4]),
		interleaved: params[5] === 'I'
	}
}


/**
 * Whether one format is equal to another
 */
function equal (a, b) {
	return (a.id || stringify(a)) === (b.id || stringify(b))
}


/**
 * Normalize format, mutable.
 * Precalculate format params: methodSuffix, id, maxInt.
 * Fill absent params.
 */
function normalize (format) {
	if (!format) format = {}

	//bring default format values, if not present
	formatProperties.forEach(function (key) {
		if (format[key] == null) {
			format[key] = defaultFormat[key]
		}
	})

	//ensure float values
	if (format.float) {
		if (format.bitDepth != 64) format.bitDepth = 32
		format.signed = true
	}

	//for words byte length does not matter
	else if (format.bitDepth <= 8) format.byteOrder = ''

	//max/min values
	if (format.float) {
		format.min = -1
		format.max = 1
	}
	else {
		format.max = Math.pow(2, format.bitDepth) - 1
		format.min = 0
		if (format.signed) {
			format.min -= Math.ceil(format.max * 0.5)
			format.max -= Math.ceil(format.max * 0.5)
		}
	}

	//calc id
	format.id = stringify(format)

	return format
}


/** Convert AudioBuffer to Buffer with specified format */
function toBuffer (audioBuffer, format) {
	if (!isNormalized(format)) format = normalize(format)

	var data = toArrayBuffer(audioBuffer)
	var arrayFormat = fromTypedArray(audioBuffer.getChannelData(0))

	var buffer = convert(data, {
		float: true,
		channels: audioBuffer.numberOfChannels,
		sampleRate: audioBuffer.sampleRate,
		interleaved: false,
		bitDepth: arrayFormat.bitDepth
	}, format)

	return buffer
}


/** Convert Buffer to AudioBuffer with specified format */
function toAudioBuffer (buffer, format) {
	if (!isNormalized(format)) format = normalize(format)

	buffer = convert(buffer, format, {
		channels: format.channels,
		sampleRate: format.sampleRate,
		interleaved: false,
		float: true
	})

	return new AudioBuffer(format.channels, buffer, format.sampleRate)
}


/**
 * Convert buffer from format A to format B.
 */
function convert (buffer, from, to) {
	//ensure formats are full
	if (!isNormalized(from)) from = normalize(from)
	if (!isNormalized(to)) to = normalize(to)

	//ignore needless conversion
	if (equal(from ,to)) {
		return buffer
	}

	//convert buffer to arrayBuffer
	var data = toArrayBuffer(buffer)

	//create containers for conversion
	var fromArray = new (arrayClass(from))(data)

	//toArray is automatically filled with mapped values
	//but in some cases mapped badly, e. g. float → int(round + rotate)
	var toArray = new (arrayClass(to))(fromArray)

	//if range differ, we should apply more thoughtful mapping
	if (from.max !== to.max) {
		fromArray.forEach(function (value, idx) {
			//ignore not changed range
			//bring to 0..1
			var normalValue = (value - from.min) / (from.max - from.min)

			//bring to new format ranges
			value = normalValue * (to.max - to.min) + to.min

			//clamp (buffers does not like values outside of bounds)
			toArray[idx] = Math.max(to.min, Math.min(to.max, value))
		})
	}

	//reinterleave, if required
	if (from.interleaved != to.interleaved) {
		var channels = from.channels
		var len = Math.floor(fromArray.length / channels)

		//deinterleave
		if (from.interleaved && !to.interleaved) {
			toArray = toArray.map(function (value, idx, data) {
				var targetOffset = idx % len
				var targetChannel = ~~(idx / len)

				return data[targetOffset * channels + targetChannel]
			})
		}
		//interleave
		else if (!from.interleaved && to.interleaved) {
			toArray = toArray.map(function (value, idx, data) {
				var targetOffset = ~~(idx / channels)
				var targetChannel = idx % channels

				return data[targetChannel * len + targetOffset]
			})
		}
	}

	//ensure endianness
	if (!to.float && from.byteOrder !== to.byteOrder) {
		var le = to.byteOrder === 'LE'
		var view = new DataView(toArray.buffer)
		var step = to.bitDepth / 8
		var methodName = 'set' + getDataViewSuffix(to)
		for (var i = 0, l = toArray.length; i < l; i++) {
			view[methodName](i*step, toArray[i], le)
		}
	}

	return new Buffer(toArray.buffer)
}


/**
 * Check whether format is normalized, at least once
 */
function isNormalized (format) {
	return format && format.id
}


/**
 * Create typed array for the format, filling with the data (ArrayBuffer)
 */
function arrayClass (format) {
	if (!isNormalized(format)) format = normalize(format)

	if (format.float) {
		if (format.bitDepth > 32) {
			return Float64Array
		}
		else {
			return Float32Array
		}
	}
	else {
		if (format.bitDepth === 32) {
			return format.signed ? Int32Array : Uint32Array
		}
		else if (format.bitDepth === 8) {
			return format.signed ? Int8Array : Uint8Array
		}
		//default case
		else {
			return format.signed ? Int16Array : Uint16Array
		}
	}
}


/**
 * Get format info from the array type
 */
function fromTypedArray (array) {
	if (array instanceof Int8Array) {
		return {
			float: false,
			signed: true,
			bitDepth: 8
		}
	}
	if ((array instanceof Uint8Array) || (array instanceof Uint8ClampedArray)) {
		return {
			float: false,
			signed: false,
			bitDepth: 8
		}
	}
	if (array instanceof Int16Array) {
		return {
			float: false,
			signed: true,
			bitDepth: 16
		}
	}
	if (array instanceof Uint16Array) {
		return {
			float: false,
			signed: false,
			bitDepth: 16
		}
	}
	if (array instanceof Int32Array) {
		return {
			float: false,
			signed: true,
			bitDepth: 32
		}
	}
	if (array instanceof Uint32Array) {
		return {
			float: false,
			signed: false,
			bitDepth: 32
		}
	}
	if (array instanceof Float32Array) {
		return {
			float: true,
			signed: false,
			bitDepth: 32
		}
	}
	if (array instanceof Float64Array) {
		return {
			float: true,
			signed: false,
			bitDepth: 64
		}
	}

	//other dataview types are Uint8Arrays
	return {
		float: false,
		signed: false,
		bitDepth: 8
	}
}


/**
 * Retrieve format info from object
 */
function fromObject (obj) {
	//else retrieve format properties from object
	var format = {}

	formatProperties.forEach(function (key) {
		if (obj[key] != null) format[key] = obj[key]
	})

	//some AudioNode/etc-specific options
	if (obj.channelCount != null) {
		format.channels = obj.channelCount
	}

	return format
}


/**
 * e. g. Float32, Uint16LE
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DataView
 */
function getDataViewSuffix (format) {
	return (format.float ? 'Float' : format.signed ? 'Int' : 'Uint') + format.bitDepth
}



module.exports = {
	defaults: defaultFormat,
	format: getFormat,
	normalize: normalize,
	equal: equal,
	toBuffer: toBuffer,
	toAudioBuffer: toAudioBuffer,
	convert: convert
}

}).call(this,require("buffer").Buffer)
},{"audio-buffer":274,"buffer":360,"is-audio-buffer":264,"os":367,"to-array-buffer":289}],274:[function(require,module,exports){
arguments[4][88][0].apply(exports,arguments)
},{"audio-context":92,"buffer-to-arraybuffer":94,"dup":88,"is-audio-buffer":264,"is-browser":265,"is-buffer":266,"is-plain-obj":268}],275:[function(require,module,exports){
'use strict';

module.exports = require('./lib')

},{"./lib":280}],276:[function(require,module,exports){
'use strict';

var asap = require('asap/raw');

function noop() {}

// States:
//
// 0 - pending
// 1 - fulfilled with _value
// 2 - rejected with _value
// 3 - adopted the state of another promise, _value
//
// once the state is no longer pending (0) it is immutable

// All `_` prefixed properties will be reduced to `_{random number}`
// at build time to obfuscate them and discourage their use.
// We don't use symbols or Object.defineProperty to fully hide them
// because the performance isn't good enough.


// to avoid using try/catch inside critical functions, we
// extract them to here.
var LAST_ERROR = null;
var IS_ERROR = {};
function getThen(obj) {
  try {
    return obj.then;
  } catch (ex) {
    LAST_ERROR = ex;
    return IS_ERROR;
  }
}

function tryCallOne(fn, a) {
  try {
    return fn(a);
  } catch (ex) {
    LAST_ERROR = ex;
    return IS_ERROR;
  }
}
function tryCallTwo(fn, a, b) {
  try {
    fn(a, b);
  } catch (ex) {
    LAST_ERROR = ex;
    return IS_ERROR;
  }
}

module.exports = Promise;

function Promise(fn) {
  if (typeof this !== 'object') {
    throw new TypeError('Promises must be constructed via new');
  }
  if (typeof fn !== 'function') {
    throw new TypeError('Promise constructor\'s argument is not a function');
  }
  this._h = 0;
  this._i = 0;
  this._j = null;
  this._k = null;
  if (fn === noop) return;
  doResolve(fn, this);
}
Promise._l = null;
Promise._m = null;
Promise._n = noop;

Promise.prototype.then = function(onFulfilled, onRejected) {
  if (this.constructor !== Promise) {
    return safeThen(this, onFulfilled, onRejected);
  }
  var res = new Promise(noop);
  handle(this, new Handler(onFulfilled, onRejected, res));
  return res;
};

function safeThen(self, onFulfilled, onRejected) {
  return new self.constructor(function (resolve, reject) {
    var res = new Promise(noop);
    res.then(resolve, reject);
    handle(self, new Handler(onFulfilled, onRejected, res));
  });
}
function handle(self, deferred) {
  while (self._i === 3) {
    self = self._j;
  }
  if (Promise._l) {
    Promise._l(self);
  }
  if (self._i === 0) {
    if (self._h === 0) {
      self._h = 1;
      self._k = deferred;
      return;
    }
    if (self._h === 1) {
      self._h = 2;
      self._k = [self._k, deferred];
      return;
    }
    self._k.push(deferred);
    return;
  }
  handleResolved(self, deferred);
}

function handleResolved(self, deferred) {
  asap(function() {
    var cb = self._i === 1 ? deferred.onFulfilled : deferred.onRejected;
    if (cb === null) {
      if (self._i === 1) {
        resolve(deferred.promise, self._j);
      } else {
        reject(deferred.promise, self._j);
      }
      return;
    }
    var ret = tryCallOne(cb, self._j);
    if (ret === IS_ERROR) {
      reject(deferred.promise, LAST_ERROR);
    } else {
      resolve(deferred.promise, ret);
    }
  });
}
function resolve(self, newValue) {
  // Promise Resolution Procedure: https://github.com/promises-aplus/promises-spec#the-promise-resolution-procedure
  if (newValue === self) {
    return reject(
      self,
      new TypeError('A promise cannot be resolved with itself.')
    );
  }
  if (
    newValue &&
    (typeof newValue === 'object' || typeof newValue === 'function')
  ) {
    var then = getThen(newValue);
    if (then === IS_ERROR) {
      return reject(self, LAST_ERROR);
    }
    if (
      then === self.then &&
      newValue instanceof Promise
    ) {
      self._i = 3;
      self._j = newValue;
      finale(self);
      return;
    } else if (typeof then === 'function') {
      doResolve(then.bind(newValue), self);
      return;
    }
  }
  self._i = 1;
  self._j = newValue;
  finale(self);
}

function reject(self, newValue) {
  self._i = 2;
  self._j = newValue;
  if (Promise._m) {
    Promise._m(self, newValue);
  }
  finale(self);
}
function finale(self) {
  if (self._h === 1) {
    handle(self, self._k);
    self._k = null;
  }
  if (self._h === 2) {
    for (var i = 0; i < self._k.length; i++) {
      handle(self, self._k[i]);
    }
    self._k = null;
  }
}

function Handler(onFulfilled, onRejected, promise){
  this.onFulfilled = typeof onFulfilled === 'function' ? onFulfilled : null;
  this.onRejected = typeof onRejected === 'function' ? onRejected : null;
  this.promise = promise;
}

/**
 * Take a potentially misbehaving resolver function and make sure
 * onFulfilled and onRejected are only called once.
 *
 * Makes no guarantees about asynchrony.
 */
function doResolve(fn, promise) {
  var done = false;
  var res = tryCallTwo(fn, function (value) {
    if (done) return;
    done = true;
    resolve(promise, value);
  }, function (reason) {
    if (done) return;
    done = true;
    reject(promise, reason);
  });
  if (!done && res === IS_ERROR) {
    done = true;
    reject(promise, LAST_ERROR);
  }
}

},{"asap/raw":85}],277:[function(require,module,exports){
'use strict';

var Promise = require('./core.js');

module.exports = Promise;
Promise.prototype.done = function (onFulfilled, onRejected) {
  var self = arguments.length ? this.then.apply(this, arguments) : this;
  self.then(null, function (err) {
    setTimeout(function () {
      throw err;
    }, 0);
  });
};

},{"./core.js":276}],278:[function(require,module,exports){
'use strict';

//This file contains the ES6 extensions to the core Promises/A+ API

var Promise = require('./core.js');

module.exports = Promise;

/* Static Functions */

var TRUE = valuePromise(true);
var FALSE = valuePromise(false);
var NULL = valuePromise(null);
var UNDEFINED = valuePromise(undefined);
var ZERO = valuePromise(0);
var EMPTYSTRING = valuePromise('');

function valuePromise(value) {
  var p = new Promise(Promise._n);
  p._i = 1;
  p._j = value;
  return p;
}
Promise.resolve = function (value) {
  if (value instanceof Promise) return value;

  if (value === null) return NULL;
  if (value === undefined) return UNDEFINED;
  if (value === true) return TRUE;
  if (value === false) return FALSE;
  if (value === 0) return ZERO;
  if (value === '') return EMPTYSTRING;

  if (typeof value === 'object' || typeof value === 'function') {
    try {
      var then = value.then;
      if (typeof then === 'function') {
        return new Promise(then.bind(value));
      }
    } catch (ex) {
      return new Promise(function (resolve, reject) {
        reject(ex);
      });
    }
  }
  return valuePromise(value);
};

Promise.all = function (arr) {
  var args = Array.prototype.slice.call(arr);

  return new Promise(function (resolve, reject) {
    if (args.length === 0) return resolve([]);
    var remaining = args.length;
    function res(i, val) {
      if (val && (typeof val === 'object' || typeof val === 'function')) {
        if (val instanceof Promise && val.then === Promise.prototype.then) {
          while (val._i === 3) {
            val = val._j;
          }
          if (val._i === 1) return res(i, val._j);
          if (val._i === 2) reject(val._j);
          val.then(function (val) {
            res(i, val);
          }, reject);
          return;
        } else {
          var then = val.then;
          if (typeof then === 'function') {
            var p = new Promise(then.bind(val));
            p.then(function (val) {
              res(i, val);
            }, reject);
            return;
          }
        }
      }
      args[i] = val;
      if (--remaining === 0) {
        resolve(args);
      }
    }
    for (var i = 0; i < args.length; i++) {
      res(i, args[i]);
    }
  });
};

Promise.reject = function (value) {
  return new Promise(function (resolve, reject) {
    reject(value);
  });
};

Promise.race = function (values) {
  return new Promise(function (resolve, reject) {
    values.forEach(function(value){
      Promise.resolve(value).then(resolve, reject);
    });
  });
};

/* Prototype Methods */

Promise.prototype['catch'] = function (onRejected) {
  return this.then(null, onRejected);
};

},{"./core.js":276}],279:[function(require,module,exports){
'use strict';

var Promise = require('./core.js');

module.exports = Promise;
Promise.prototype.finally = function (f) {
  return this.then(function (value) {
    return Promise.resolve(f()).then(function () {
      return value;
    });
  }, function (err) {
    return Promise.resolve(f()).then(function () {
      throw err;
    });
  });
};

},{"./core.js":276}],280:[function(require,module,exports){
'use strict';

module.exports = require('./core.js');
require('./done.js');
require('./finally.js');
require('./es6-extensions.js');
require('./node-extensions.js');
require('./synchronous.js');

},{"./core.js":276,"./done.js":277,"./es6-extensions.js":278,"./finally.js":279,"./node-extensions.js":281,"./synchronous.js":282}],281:[function(require,module,exports){
'use strict';

// This file contains then/promise specific extensions that are only useful
// for node.js interop

var Promise = require('./core.js');
var asap = require('asap');

module.exports = Promise;

/* Static Functions */

Promise.denodeify = function (fn, argumentCount) {
  if (
    typeof argumentCount === 'number' && argumentCount !== Infinity
  ) {
    return denodeifyWithCount(fn, argumentCount);
  } else {
    return denodeifyWithoutCount(fn);
  }
};

var callbackFn = (
  'function (err, res) {' +
  'if (err) { rj(err); } else { rs(res); }' +
  '}'
);
function denodeifyWithCount(fn, argumentCount) {
  var args = [];
  for (var i = 0; i < argumentCount; i++) {
    args.push('a' + i);
  }
  var body = [
    'return function (' + args.join(',') + ') {',
    'var self = this;',
    'return new Promise(function (rs, rj) {',
    'var res = fn.call(',
    ['self'].concat(args).concat([callbackFn]).join(','),
    ');',
    'if (res &&',
    '(typeof res === "object" || typeof res === "function") &&',
    'typeof res.then === "function"',
    ') {rs(res);}',
    '});',
    '};'
  ].join('');
  return Function(['Promise', 'fn'], body)(Promise, fn);
}
function denodeifyWithoutCount(fn) {
  var fnLength = Math.max(fn.length - 1, 3);
  var args = [];
  for (var i = 0; i < fnLength; i++) {
    args.push('a' + i);
  }
  var body = [
    'return function (' + args.join(',') + ') {',
    'var self = this;',
    'var args;',
    'var argLength = arguments.length;',
    'if (arguments.length > ' + fnLength + ') {',
    'args = new Array(arguments.length + 1);',
    'for (var i = 0; i < arguments.length; i++) {',
    'args[i] = arguments[i];',
    '}',
    '}',
    'return new Promise(function (rs, rj) {',
    'var cb = ' + callbackFn + ';',
    'var res;',
    'switch (argLength) {',
    args.concat(['extra']).map(function (_, index) {
      return (
        'case ' + (index) + ':' +
        'res = fn.call(' + ['self'].concat(args.slice(0, index)).concat('cb').join(',') + ');' +
        'break;'
      );
    }).join(''),
    'default:',
    'args[argLength] = cb;',
    'res = fn.apply(self, args);',
    '}',
    
    'if (res &&',
    '(typeof res === "object" || typeof res === "function") &&',
    'typeof res.then === "function"',
    ') {rs(res);}',
    '});',
    '};'
  ].join('');

  return Function(
    ['Promise', 'fn'],
    body
  )(Promise, fn);
}

Promise.nodeify = function (fn) {
  return function () {
    var args = Array.prototype.slice.call(arguments);
    var callback =
      typeof args[args.length - 1] === 'function' ? args.pop() : null;
    var ctx = this;
    try {
      return fn.apply(this, arguments).nodeify(callback, ctx);
    } catch (ex) {
      if (callback === null || typeof callback == 'undefined') {
        return new Promise(function (resolve, reject) {
          reject(ex);
        });
      } else {
        asap(function () {
          callback.call(ctx, ex);
        })
      }
    }
  }
};

Promise.prototype.nodeify = function (callback, ctx) {
  if (typeof callback != 'function') return this;

  this.then(function (value) {
    asap(function () {
      callback.call(ctx, null, value);
    });
  }, function (err) {
    asap(function () {
      callback.call(ctx, err);
    });
  });
};

},{"./core.js":276,"asap":84}],282:[function(require,module,exports){
'use strict';

var Promise = require('./core.js');

module.exports = Promise;
Promise.enableSynchronous = function () {
  Promise.prototype.isPending = function() {
    return this.getState() == 0;
  };

  Promise.prototype.isFulfilled = function() {
    return this.getState() == 1;
  };

  Promise.prototype.isRejected = function() {
    return this.getState() == 2;
  };

  Promise.prototype.getValue = function () {
    if (this._i === 3) {
      return this._j.getValue();
    }

    if (!this.isFulfilled()) {
      throw new Error('Cannot get a value of an unfulfilled promise.');
    }

    return this._j;
  };

  Promise.prototype.getReason = function () {
    if (this._i === 3) {
      return this._j.getReason();
    }

    if (!this.isRejected()) {
      throw new Error('Cannot get a rejection reason of a non-rejected promise.');
    }

    return this._j;
  };

  Promise.prototype.getState = function () {
    if (this._i === 3) {
      return this._j.getState();
    }
    if (this._i === -1 || this._i === -2) {
      return 0;
    }

    return this._i;
  };
};

Promise.disableSynchronous = function() {
  Promise.prototype.isPending = undefined;
  Promise.prototype.isFulfilled = undefined;
  Promise.prototype.isRejected = undefined;
  Promise.prototype.getValue = undefined;
  Promise.prototype.getReason = undefined;
  Promise.prototype.getState = undefined;
};

},{"./core.js":276}],283:[function(require,module,exports){
module.exports=[
"Aaren"
,
"Aarika"
,
"Abagael"
,
"Abagail"
,
"Abbe"
,
"Abbey"
,
"Abbi"
,
"Abbie"
,
"Abby"
,
"Abbye"
,
"Abigael"
,
"Abigail"
,
"Abigale"
,
"Abra"
,
"Ada"
,
"Adah"
,
"Adaline"
,
"Adan"
,
"Adara"
,
"Adda"
,
"Addi"
,
"Addia"
,
"Addie"
,
"Addy"
,
"Adel"
,
"Adela"
,
"Adelaida"
,
"Adelaide"
,
"Adele"
,
"Adelheid"
,
"Adelice"
,
"Adelina"
,
"Adelind"
,
"Adeline"
,
"Adella"
,
"Adelle"
,
"Adena"
,
"Adey"
,
"Adi"
,
"Adiana"
,
"Adina"
,
"Adora"
,
"Adore"
,
"Adoree"
,
"Adorne"
,
"Adrea"
,
"Adria"
,
"Adriaens"
,
"Adrian"
,
"Adriana"
,
"Adriane"
,
"Adrianna"
,
"Adrianne"
,
"Adriena"
,
"Adrienne"
,
"Aeriel"
,
"Aeriela"
,
"Aeriell"
,
"Afton"
,
"Ag"
,
"Agace"
,
"Agata"
,
"Agatha"
,
"Agathe"
,
"Aggi"
,
"Aggie"
,
"Aggy"
,
"Agna"
,
"Agnella"
,
"Agnes"
,
"Agnese"
,
"Agnesse"
,
"Agneta"
,
"Agnola"
,
"Agretha"
,
"Aida"
,
"Aidan"
,
"Aigneis"
,
"Aila"
,
"Aile"
,
"Ailee"
,
"Aileen"
,
"Ailene"
,
"Ailey"
,
"Aili"
,
"Ailina"
,
"Ailis"
,
"Ailsun"
,
"Ailyn"
,
"Aime"
,
"Aimee"
,
"Aimil"
,
"Aindrea"
,
"Ainslee"
,
"Ainsley"
,
"Ainslie"
,
"Ajay"
,
"Alaine"
,
"Alameda"
,
"Alana"
,
"Alanah"
,
"Alane"
,
"Alanna"
,
"Alayne"
,
"Alberta"
,
"Albertina"
,
"Albertine"
,
"Albina"
,
"Alecia"
,
"Aleda"
,
"Aleece"
,
"Aleen"
,
"Alejandra"
,
"Alejandrina"
,
"Alena"
,
"Alene"
,
"Alessandra"
,
"Aleta"
,
"Alethea"
,
"Alex"
,
"Alexa"
,
"Alexandra"
,
"Alexandrina"
,
"Alexi"
,
"Alexia"
,
"Alexina"
,
"Alexine"
,
"Alexis"
,
"Alfi"
,
"Alfie"
,
"Alfreda"
,
"Alfy"
,
"Ali"
,
"Alia"
,
"Alica"
,
"Alice"
,
"Alicea"
,
"Alicia"
,
"Alida"
,
"Alidia"
,
"Alie"
,
"Alika"
,
"Alikee"
,
"Alina"
,
"Aline"
,
"Alis"
,
"Alisa"
,
"Alisha"
,
"Alison"
,
"Alissa"
,
"Alisun"
,
"Alix"
,
"Aliza"
,
"Alla"
,
"Alleen"
,
"Allegra"
,
"Allene"
,
"Alli"
,
"Allianora"
,
"Allie"
,
"Allina"
,
"Allis"
,
"Allison"
,
"Allissa"
,
"Allix"
,
"Allsun"
,
"Allx"
,
"Ally"
,
"Allyce"
,
"Allyn"
,
"Allys"
,
"Allyson"
,
"Alma"
,
"Almeda"
,
"Almeria"
,
"Almeta"
,
"Almira"
,
"Almire"
,
"Aloise"
,
"Aloisia"
,
"Aloysia"
,
"Alta"
,
"Althea"
,
"Alvera"
,
"Alverta"
,
"Alvina"
,
"Alvinia"
,
"Alvira"
,
"Alyce"
,
"Alyda"
,
"Alys"
,
"Alysa"
,
"Alyse"
,
"Alysia"
,
"Alyson"
,
"Alyss"
,
"Alyssa"
,
"Amabel"
,
"Amabelle"
,
"Amalea"
,
"Amalee"
,
"Amaleta"
,
"Amalia"
,
"Amalie"
,
"Amalita"
,
"Amalle"
,
"Amanda"
,
"Amandi"
,
"Amandie"
,
"Amandy"
,
"Amara"
,
"Amargo"
,
"Amata"
,
"Amber"
,
"Amberly"
,
"Ambur"
,
"Ame"
,
"Amelia"
,
"Amelie"
,
"Amelina"
,
"Ameline"
,
"Amelita"
,
"Ami"
,
"Amie"
,
"Amii"
,
"Amil"
,
"Amitie"
,
"Amity"
,
"Ammamaria"
,
"Amy"
,
"Amye"
,
"Ana"
,
"Anabal"
,
"Anabel"
,
"Anabella"
,
"Anabelle"
,
"Analiese"
,
"Analise"
,
"Anallese"
,
"Anallise"
,
"Anastasia"
,
"Anastasie"
,
"Anastassia"
,
"Anatola"
,
"Andee"
,
"Andeee"
,
"Anderea"
,
"Andi"
,
"Andie"
,
"Andra"
,
"Andrea"
,
"Andreana"
,
"Andree"
,
"Andrei"
,
"Andria"
,
"Andriana"
,
"Andriette"
,
"Andromache"
,
"Andy"
,
"Anestassia"
,
"Anet"
,
"Anett"
,
"Anetta"
,
"Anette"
,
"Ange"
,
"Angel"
,
"Angela"
,
"Angele"
,
"Angelia"
,
"Angelica"
,
"Angelika"
,
"Angelina"
,
"Angeline"
,
"Angelique"
,
"Angelita"
,
"Angelle"
,
"Angie"
,
"Angil"
,
"Angy"
,
"Ania"
,
"Anica"
,
"Anissa"
,
"Anita"
,
"Anitra"
,
"Anjanette"
,
"Anjela"
,
"Ann"
,
"Ann-Marie"
,
"Anna"
,
"Anna-Diana"
,
"Anna-Diane"
,
"Anna-Maria"
,
"Annabal"
,
"Annabel"
,
"Annabela"
,
"Annabell"
,
"Annabella"
,
"Annabelle"
,
"Annadiana"
,
"Annadiane"
,
"Annalee"
,
"Annaliese"
,
"Annalise"
,
"Annamaria"
,
"Annamarie"
,
"Anne"
,
"Anne-Corinne"
,
"Anne-Marie"
,
"Annecorinne"
,
"Anneliese"
,
"Annelise"
,
"Annemarie"
,
"Annetta"
,
"Annette"
,
"Anni"
,
"Annice"
,
"Annie"
,
"Annis"
,
"Annissa"
,
"Annmaria"
,
"Annmarie"
,
"Annnora"
,
"Annora"
,
"Anny"
,
"Anselma"
,
"Ansley"
,
"Anstice"
,
"Anthe"
,
"Anthea"
,
"Anthia"
,
"Anthiathia"
,
"Antoinette"
,
"Antonella"
,
"Antonetta"
,
"Antonia"
,
"Antonie"
,
"Antonietta"
,
"Antonina"
,
"Anya"
,
"Appolonia"
,
"April"
,
"Aprilette"
,
"Ara"
,
"Arabel"
,
"Arabela"
,
"Arabele"
,
"Arabella"
,
"Arabelle"
,
"Arda"
,
"Ardath"
,
"Ardeen"
,
"Ardelia"
,
"Ardelis"
,
"Ardella"
,
"Ardelle"
,
"Arden"
,
"Ardene"
,
"Ardenia"
,
"Ardine"
,
"Ardis"
,
"Ardisj"
,
"Ardith"
,
"Ardra"
,
"Ardyce"
,
"Ardys"
,
"Ardyth"
,
"Aretha"
,
"Ariadne"
,
"Ariana"
,
"Aridatha"
,
"Ariel"
,
"Ariela"
,
"Ariella"
,
"Arielle"
,
"Arlana"
,
"Arlee"
,
"Arleen"
,
"Arlen"
,
"Arlena"
,
"Arlene"
,
"Arleta"
,
"Arlette"
,
"Arleyne"
,
"Arlie"
,
"Arliene"
,
"Arlina"
,
"Arlinda"
,
"Arline"
,
"Arluene"
,
"Arly"
,
"Arlyn"
,
"Arlyne"
,
"Aryn"
,
"Ashely"
,
"Ashia"
,
"Ashien"
,
"Ashil"
,
"Ashla"
,
"Ashlan"
,
"Ashlee"
,
"Ashleigh"
,
"Ashlen"
,
"Ashley"
,
"Ashli"
,
"Ashlie"
,
"Ashly"
,
"Asia"
,
"Astra"
,
"Astrid"
,
"Astrix"
,
"Atalanta"
,
"Athena"
,
"Athene"
,
"Atlanta"
,
"Atlante"
,
"Auberta"
,
"Aubine"
,
"Aubree"
,
"Aubrette"
,
"Aubrey"
,
"Aubrie"
,
"Aubry"
,
"Audi"
,
"Audie"
,
"Audra"
,
"Audre"
,
"Audrey"
,
"Audrie"
,
"Audry"
,
"Audrye"
,
"Audy"
,
"Augusta"
,
"Auguste"
,
"Augustina"
,
"Augustine"
,
"Aundrea"
,
"Aura"
,
"Aurea"
,
"Aurel"
,
"Aurelea"
,
"Aurelia"
,
"Aurelie"
,
"Auria"
,
"Aurie"
,
"Aurilia"
,
"Aurlie"
,
"Auroora"
,
"Aurora"
,
"Aurore"
,
"Austin"
,
"Austina"
,
"Austine"
,
"Ava"
,
"Aveline"
,
"Averil"
,
"Averyl"
,
"Avie"
,
"Avis"
,
"Aviva"
,
"Avivah"
,
"Avril"
,
"Avrit"
,
"Ayn"
,
"Bab"
,
"Babara"
,
"Babb"
,
"Babbette"
,
"Babbie"
,
"Babette"
,
"Babita"
,
"Babs"
,
"Bambi"
,
"Bambie"
,
"Bamby"
,
"Barb"
,
"Barbabra"
,
"Barbara"
,
"Barbara-Anne"
,
"Barbaraanne"
,
"Barbe"
,
"Barbee"
,
"Barbette"
,
"Barbey"
,
"Barbi"
,
"Barbie"
,
"Barbra"
,
"Barby"
,
"Bari"
,
"Barrie"
,
"Barry"
,
"Basia"
,
"Bathsheba"
,
"Batsheva"
,
"Bea"
,
"Beatrice"
,
"Beatrisa"
,
"Beatrix"
,
"Beatriz"
,
"Bebe"
,
"Becca"
,
"Becka"
,
"Becki"
,
"Beckie"
,
"Becky"
,
"Bee"
,
"Beilul"
,
"Beitris"
,
"Bekki"
,
"Bel"
,
"Belia"
,
"Belicia"
,
"Belinda"
,
"Belita"
,
"Bell"
,
"Bella"
,
"Bellanca"
,
"Belle"
,
"Bellina"
,
"Belva"
,
"Belvia"
,
"Bendite"
,
"Benedetta"
,
"Benedicta"
,
"Benedikta"
,
"Benetta"
,
"Benita"
,
"Benni"
,
"Bennie"
,
"Benny"
,
"Benoite"
,
"Berenice"
,
"Beret"
,
"Berget"
,
"Berna"
,
"Bernadene"
,
"Bernadette"
,
"Bernadina"
,
"Bernadine"
,
"Bernardina"
,
"Bernardine"
,
"Bernelle"
,
"Bernete"
,
"Bernetta"
,
"Bernette"
,
"Berni"
,
"Bernice"
,
"Bernie"
,
"Bernita"
,
"Berny"
,
"Berri"
,
"Berrie"
,
"Berry"
,
"Bert"
,
"Berta"
,
"Berte"
,
"Bertha"
,
"Berthe"
,
"Berti"
,
"Bertie"
,
"Bertina"
,
"Bertine"
,
"Berty"
,
"Beryl"
,
"Beryle"
,
"Bess"
,
"Bessie"
,
"Bessy"
,
"Beth"
,
"Bethanne"
,
"Bethany"
,
"Bethena"
,
"Bethina"
,
"Betsey"
,
"Betsy"
,
"Betta"
,
"Bette"
,
"Bette-Ann"
,
"Betteann"
,
"Betteanne"
,
"Betti"
,
"Bettina"
,
"Bettine"
,
"Betty"
,
"Bettye"
,
"Beulah"
,
"Bev"
,
"Beverie"
,
"Beverlee"
,
"Beverley"
,
"Beverlie"
,
"Beverly"
,
"Bevvy"
,
"Bianca"
,
"Bianka"
,
"Bibbie"
,
"Bibby"
,
"Bibbye"
,
"Bibi"
,
"Biddie"
,
"Biddy"
,
"Bidget"
,
"Bili"
,
"Bill"
,
"Billi"
,
"Billie"
,
"Billy"
,
"Billye"
,
"Binni"
,
"Binnie"
,
"Binny"
,
"Bird"
,
"Birdie"
,
"Birgit"
,
"Birgitta"
,
"Blair"
,
"Blaire"
,
"Blake"
,
"Blakelee"
,
"Blakeley"
,
"Blanca"
,
"Blanch"
,
"Blancha"
,
"Blanche"
,
"Blinni"
,
"Blinnie"
,
"Blinny"
,
"Bliss"
,
"Blisse"
,
"Blithe"
,
"Blondell"
,
"Blondelle"
,
"Blondie"
,
"Blondy"
,
"Blythe"
,
"Bobbe"
,
"Bobbee"
,
"Bobbette"
,
"Bobbi"
,
"Bobbie"
,
"Bobby"
,
"Bobbye"
,
"Bobette"
,
"Bobina"
,
"Bobine"
,
"Bobinette"
,
"Bonita"
,
"Bonnee"
,
"Bonni"
,
"Bonnibelle"
,
"Bonnie"
,
"Bonny"
,
"Brana"
,
"Brandais"
,
"Brande"
,
"Brandea"
,
"Brandi"
,
"Brandice"
,
"Brandie"
,
"Brandise"
,
"Brandy"
,
"Breanne"
,
"Brear"
,
"Bree"
,
"Breena"
,
"Bren"
,
"Brena"
,
"Brenda"
,
"Brenn"
,
"Brenna"
,
"Brett"
,
"Bria"
,
"Briana"
,
"Brianna"
,
"Brianne"
,
"Bride"
,
"Bridget"
,
"Bridgette"
,
"Bridie"
,
"Brier"
,
"Brietta"
,
"Brigid"
,
"Brigida"
,
"Brigit"
,
"Brigitta"
,
"Brigitte"
,
"Brina"
,
"Briney"
,
"Brinn"
,
"Brinna"
,
"Briny"
,
"Brit"
,
"Brita"
,
"Britney"
,
"Britni"
,
"Britt"
,
"Britta"
,
"Brittan"
,
"Brittaney"
,
"Brittani"
,
"Brittany"
,
"Britte"
,
"Britteny"
,
"Brittne"
,
"Brittney"
,
"Brittni"
,
"Brook"
,
"Brooke"
,
"Brooks"
,
"Brunhilda"
,
"Brunhilde"
,
"Bryana"
,
"Bryn"
,
"Bryna"
,
"Brynn"
,
"Brynna"
,
"Brynne"
,
"Buffy"
,
"Bunni"
,
"Bunnie"
,
"Bunny"
,
"Cacilia"
,
"Cacilie"
,
"Cahra"
,
"Cairistiona"
,
"Caitlin"
,
"Caitrin"
,
"Cal"
,
"Calida"
,
"Calla"
,
"Calley"
,
"Calli"
,
"Callida"
,
"Callie"
,
"Cally"
,
"Calypso"
,
"Cam"
,
"Camala"
,
"Camel"
,
"Camella"
,
"Camellia"
,
"Cami"
,
"Camila"
,
"Camile"
,
"Camilla"
,
"Camille"
,
"Cammi"
,
"Cammie"
,
"Cammy"
,
"Candace"
,
"Candi"
,
"Candice"
,
"Candida"
,
"Candide"
,
"Candie"
,
"Candis"
,
"Candra"
,
"Candy"
,
"Caprice"
,
"Cara"
,
"Caralie"
,
"Caren"
,
"Carena"
,
"Caresa"
,
"Caressa"
,
"Caresse"
,
"Carey"
,
"Cari"
,
"Caria"
,
"Carie"
,
"Caril"
,
"Carilyn"
,
"Carin"
,
"Carina"
,
"Carine"
,
"Cariotta"
,
"Carissa"
,
"Carita"
,
"Caritta"
,
"Carla"
,
"Carlee"
,
"Carleen"
,
"Carlen"
,
"Carlene"
,
"Carley"
,
"Carlie"
,
"Carlin"
,
"Carlina"
,
"Carline"
,
"Carlita"
,
"Carlota"
,
"Carlotta"
,
"Carly"
,
"Carlye"
,
"Carlyn"
,
"Carlynn"
,
"Carlynne"
,
"Carma"
,
"Carmel"
,
"Carmela"
,
"Carmelia"
,
"Carmelina"
,
"Carmelita"
,
"Carmella"
,
"Carmelle"
,
"Carmen"
,
"Carmencita"
,
"Carmina"
,
"Carmine"
,
"Carmita"
,
"Carmon"
,
"Caro"
,
"Carol"
,
"Carol-Jean"
,
"Carola"
,
"Carolan"
,
"Carolann"
,
"Carole"
,
"Carolee"
,
"Carolin"
,
"Carolina"
,
"Caroline"
,
"Caroljean"
,
"Carolyn"
,
"Carolyne"
,
"Carolynn"
,
"Caron"
,
"Carree"
,
"Carri"
,
"Carrie"
,
"Carrissa"
,
"Carroll"
,
"Carry"
,
"Cary"
,
"Caryl"
,
"Caryn"
,
"Casandra"
,
"Casey"
,
"Casi"
,
"Casie"
,
"Cass"
,
"Cassandra"
,
"Cassandre"
,
"Cassandry"
,
"Cassaundra"
,
"Cassey"
,
"Cassi"
,
"Cassie"
,
"Cassondra"
,
"Cassy"
,
"Catarina"
,
"Cate"
,
"Caterina"
,
"Catha"
,
"Catharina"
,
"Catharine"
,
"Cathe"
,
"Cathee"
,
"Catherin"
,
"Catherina"
,
"Catherine"
,
"Cathi"
,
"Cathie"
,
"Cathleen"
,
"Cathlene"
,
"Cathrin"
,
"Cathrine"
,
"Cathryn"
,
"Cathy"
,
"Cathyleen"
,
"Cati"
,
"Catie"
,
"Catina"
,
"Catlaina"
,
"Catlee"
,
"Catlin"
,
"Catrina"
,
"Catriona"
,
"Caty"
,
"Caye"
,
"Cayla"
,
"Cecelia"
,
"Cecil"
,
"Cecile"
,
"Ceciley"
,
"Cecilia"
,
"Cecilla"
,
"Cecily"
,
"Ceil"
,
"Cele"
,
"Celene"
,
"Celesta"
,
"Celeste"
,
"Celestia"
,
"Celestina"
,
"Celestine"
,
"Celestyn"
,
"Celestyna"
,
"Celia"
,
"Celie"
,
"Celina"
,
"Celinda"
,
"Celine"
,
"Celinka"
,
"Celisse"
,
"Celka"
,
"Celle"
,
"Cesya"
,
"Chad"
,
"Chanda"
,
"Chandal"
,
"Chandra"
,
"Channa"
,
"Chantal"
,
"Chantalle"
,
"Charil"
,
"Charin"
,
"Charis"
,
"Charissa"
,
"Charisse"
,
"Charita"
,
"Charity"
,
"Charla"
,
"Charlean"
,
"Charleen"
,
"Charlena"
,
"Charlene"
,
"Charline"
,
"Charlot"
,
"Charlotta"
,
"Charlotte"
,
"Charmain"
,
"Charmaine"
,
"Charmane"
,
"Charmian"
,
"Charmine"
,
"Charmion"
,
"Charo"
,
"Charyl"
,
"Chastity"
,
"Chelsae"
,
"Chelsea"
,
"Chelsey"
,
"Chelsie"
,
"Chelsy"
,
"Cher"
,
"Chere"
,
"Cherey"
,
"Cheri"
,
"Cherianne"
,
"Cherice"
,
"Cherida"
,
"Cherie"
,
"Cherilyn"
,
"Cherilynn"
,
"Cherin"
,
"Cherise"
,
"Cherish"
,
"Cherlyn"
,
"Cherri"
,
"Cherrita"
,
"Cherry"
,
"Chery"
,
"Cherye"
,
"Cheryl"
,
"Cheslie"
,
"Chiarra"
,
"Chickie"
,
"Chicky"
,
"Chiquia"
,
"Chiquita"
,
"Chlo"
,
"Chloe"
,
"Chloette"
,
"Chloris"
,
"Chris"
,
"Chrissie"
,
"Chrissy"
,
"Christa"
,
"Christabel"
,
"Christabella"
,
"Christal"
,
"Christalle"
,
"Christan"
,
"Christean"
,
"Christel"
,
"Christen"
,
"Christi"
,
"Christian"
,
"Christiana"
,
"Christiane"
,
"Christie"
,
"Christin"
,
"Christina"
,
"Christine"
,
"Christy"
,
"Christye"
,
"Christyna"
,
"Chrysa"
,
"Chrysler"
,
"Chrystal"
,
"Chryste"
,
"Chrystel"
,
"Cicely"
,
"Cicily"
,
"Ciel"
,
"Cilka"
,
"Cinda"
,
"Cindee"
,
"Cindelyn"
,
"Cinderella"
,
"Cindi"
,
"Cindie"
,
"Cindra"
,
"Cindy"
,
"Cinnamon"
,
"Cissiee"
,
"Cissy"
,
"Clair"
,
"Claire"
,
"Clara"
,
"Clarabelle"
,
"Clare"
,
"Claresta"
,
"Clareta"
,
"Claretta"
,
"Clarette"
,
"Clarey"
,
"Clari"
,
"Claribel"
,
"Clarice"
,
"Clarie"
,
"Clarinda"
,
"Clarine"
,
"Clarissa"
,
"Clarisse"
,
"Clarita"
,
"Clary"
,
"Claude"
,
"Claudelle"
,
"Claudetta"
,
"Claudette"
,
"Claudia"
,
"Claudie"
,
"Claudina"
,
"Claudine"
,
"Clea"
,
"Clem"
,
"Clemence"
,
"Clementia"
,
"Clementina"
,
"Clementine"
,
"Clemmie"
,
"Clemmy"
,
"Cleo"
,
"Cleopatra"
,
"Clerissa"
,
"Clio"
,
"Clo"
,
"Cloe"
,
"Cloris"
,
"Clotilda"
,
"Clovis"
,
"Codee"
,
"Codi"
,
"Codie"
,
"Cody"
,
"Coleen"
,
"Colene"
,
"Coletta"
,
"Colette"
,
"Colleen"
,
"Collen"
,
"Collete"
,
"Collette"
,
"Collie"
,
"Colline"
,
"Colly"
,
"Con"
,
"Concettina"
,
"Conchita"
,
"Concordia"
,
"Conni"
,
"Connie"
,
"Conny"
,
"Consolata"
,
"Constance"
,
"Constancia"
,
"Constancy"
,
"Constanta"
,
"Constantia"
,
"Constantina"
,
"Constantine"
,
"Consuela"
,
"Consuelo"
,
"Cookie"
,
"Cora"
,
"Corabel"
,
"Corabella"
,
"Corabelle"
,
"Coral"
,
"Coralie"
,
"Coraline"
,
"Coralyn"
,
"Cordelia"
,
"Cordelie"
,
"Cordey"
,
"Cordi"
,
"Cordie"
,
"Cordula"
,
"Cordy"
,
"Coreen"
,
"Corella"
,
"Corenda"
,
"Corene"
,
"Coretta"
,
"Corette"
,
"Corey"
,
"Cori"
,
"Corie"
,
"Corilla"
,
"Corina"
,
"Corine"
,
"Corinna"
,
"Corinne"
,
"Coriss"
,
"Corissa"
,
"Corliss"
,
"Corly"
,
"Cornela"
,
"Cornelia"
,
"Cornelle"
,
"Cornie"
,
"Corny"
,
"Correna"
,
"Correy"
,
"Corri"
,
"Corrianne"
,
"Corrie"
,
"Corrina"
,
"Corrine"
,
"Corrinne"
,
"Corry"
,
"Cortney"
,
"Cory"
,
"Cosetta"
,
"Cosette"
,
"Costanza"
,
"Courtenay"
,
"Courtnay"
,
"Courtney"
,
"Crin"
,
"Cris"
,
"Crissie"
,
"Crissy"
,
"Crista"
,
"Cristabel"
,
"Cristal"
,
"Cristen"
,
"Cristi"
,
"Cristie"
,
"Cristin"
,
"Cristina"
,
"Cristine"
,
"Cristionna"
,
"Cristy"
,
"Crysta"
,
"Crystal"
,
"Crystie"
,
"Cthrine"
,
"Cyb"
,
"Cybil"
,
"Cybill"
,
"Cymbre"
,
"Cynde"
,
"Cyndi"
,
"Cyndia"
,
"Cyndie"
,
"Cyndy"
,
"Cynthea"
,
"Cynthia"
,
"Cynthie"
,
"Cynthy"
,
"Dacey"
,
"Dacia"
,
"Dacie"
,
"Dacy"
,
"Dael"
,
"Daffi"
,
"Daffie"
,
"Daffy"
,
"Dagmar"
,
"Dahlia"
,
"Daile"
,
"Daisey"
,
"Daisi"
,
"Daisie"
,
"Daisy"
,
"Dale"
,
"Dalenna"
,
"Dalia"
,
"Dalila"
,
"Dallas"
,
"Daloris"
,
"Damara"
,
"Damaris"
,
"Damita"
,
"Dana"
,
"Danell"
,
"Danella"
,
"Danette"
,
"Dani"
,
"Dania"
,
"Danica"
,
"Danice"
,
"Daniela"
,
"Daniele"
,
"Daniella"
,
"Danielle"
,
"Danika"
,
"Danila"
,
"Danit"
,
"Danita"
,
"Danna"
,
"Danni"
,
"Dannie"
,
"Danny"
,
"Dannye"
,
"Danya"
,
"Danyelle"
,
"Danyette"
,
"Daphene"
,
"Daphna"
,
"Daphne"
,
"Dara"
,
"Darb"
,
"Darbie"
,
"Darby"
,
"Darcee"
,
"Darcey"
,
"Darci"
,
"Darcie"
,
"Darcy"
,
"Darda"
,
"Dareen"
,
"Darell"
,
"Darelle"
,
"Dari"
,
"Daria"
,
"Darice"
,
"Darla"
,
"Darleen"
,
"Darlene"
,
"Darline"
,
"Darlleen"
,
"Daron"
,
"Darrelle"
,
"Darryl"
,
"Darsey"
,
"Darsie"
,
"Darya"
,
"Daryl"
,
"Daryn"
,
"Dasha"
,
"Dasi"
,
"Dasie"
,
"Dasya"
,
"Datha"
,
"Daune"
,
"Daveen"
,
"Daveta"
,
"Davida"
,
"Davina"
,
"Davine"
,
"Davita"
,
"Dawn"
,
"Dawna"
,
"Dayle"
,
"Dayna"
,
"Ddene"
,
"De"
,
"Deana"
,
"Deane"
,
"Deanna"
,
"Deanne"
,
"Deb"
,
"Debbi"
,
"Debbie"
,
"Debby"
,
"Debee"
,
"Debera"
,
"Debi"
,
"Debor"
,
"Debora"
,
"Deborah"
,
"Debra"
,
"Dede"
,
"Dedie"
,
"Dedra"
,
"Dee"
,
"Dee Dee"
,
"Deeann"
,
"Deeanne"
,
"Deedee"
,
"Deena"
,
"Deerdre"
,
"Deeyn"
,
"Dehlia"
,
"Deidre"
,
"Deina"
,
"Deirdre"
,
"Del"
,
"Dela"
,
"Delcina"
,
"Delcine"
,
"Delia"
,
"Delila"
,
"Delilah"
,
"Delinda"
,
"Dell"
,
"Della"
,
"Delly"
,
"Delora"
,
"Delores"
,
"Deloria"
,
"Deloris"
,
"Delphine"
,
"Delphinia"
,
"Demeter"
,
"Demetra"
,
"Demetria"
,
"Demetris"
,
"Dena"
,
"Deni"
,
"Denice"
,
"Denise"
,
"Denna"
,
"Denni"
,
"Dennie"
,
"Denny"
,
"Deny"
,
"Denys"
,
"Denyse"
,
"Deonne"
,
"Desdemona"
,
"Desirae"
,
"Desiree"
,
"Desiri"
,
"Deva"
,
"Devan"
,
"Devi"
,
"Devin"
,
"Devina"
,
"Devinne"
,
"Devon"
,
"Devondra"
,
"Devonna"
,
"Devonne"
,
"Devora"
,
"Di"
,
"Diahann"
,
"Dian"
,
"Diana"
,
"Diandra"
,
"Diane"
,
"Diane-Marie"
,
"Dianemarie"
,
"Diann"
,
"Dianna"
,
"Dianne"
,
"Diannne"
,
"Didi"
,
"Dido"
,
"Diena"
,
"Dierdre"
,
"Dina"
,
"Dinah"
,
"Dinnie"
,
"Dinny"
,
"Dion"
,
"Dione"
,
"Dionis"
,
"Dionne"
,
"Dita"
,
"Dix"
,
"Dixie"
,
"Dniren"
,
"Dode"
,
"Dodi"
,
"Dodie"
,
"Dody"
,
"Doe"
,
"Doll"
,
"Dolley"
,
"Dolli"
,
"Dollie"
,
"Dolly"
,
"Dolores"
,
"Dolorita"
,
"Doloritas"
,
"Domeniga"
,
"Dominga"
,
"Domini"
,
"Dominica"
,
"Dominique"
,
"Dona"
,
"Donella"
,
"Donelle"
,
"Donetta"
,
"Donia"
,
"Donica"
,
"Donielle"
,
"Donna"
,
"Donnamarie"
,
"Donni"
,
"Donnie"
,
"Donny"
,
"Dora"
,
"Doralia"
,
"Doralin"
,
"Doralyn"
,
"Doralynn"
,
"Doralynne"
,
"Dore"
,
"Doreen"
,
"Dorelia"
,
"Dorella"
,
"Dorelle"
,
"Dorena"
,
"Dorene"
,
"Doretta"
,
"Dorette"
,
"Dorey"
,
"Dori"
,
"Doria"
,
"Dorian"
,
"Dorice"
,
"Dorie"
,
"Dorine"
,
"Doris"
,
"Dorisa"
,
"Dorise"
,
"Dorita"
,
"Doro"
,
"Dorolice"
,
"Dorolisa"
,
"Dorotea"
,
"Doroteya"
,
"Dorothea"
,
"Dorothee"
,
"Dorothy"
,
"Dorree"
,
"Dorri"
,
"Dorrie"
,
"Dorris"
,
"Dorry"
,
"Dorthea"
,
"Dorthy"
,
"Dory"
,
"Dosi"
,
"Dot"
,
"Doti"
,
"Dotti"
,
"Dottie"
,
"Dotty"
,
"Dre"
,
"Dreddy"
,
"Dredi"
,
"Drona"
,
"Dru"
,
"Druci"
,
"Drucie"
,
"Drucill"
,
"Drucy"
,
"Drusi"
,
"Drusie"
,
"Drusilla"
,
"Drusy"
,
"Dulce"
,
"Dulcea"
,
"Dulci"
,
"Dulcia"
,
"Dulciana"
,
"Dulcie"
,
"Dulcine"
,
"Dulcinea"
,
"Dulcy"
,
"Dulsea"
,
"Dusty"
,
"Dyan"
,
"Dyana"
,
"Dyane"
,
"Dyann"
,
"Dyanna"
,
"Dyanne"
,
"Dyna"
,
"Dynah"
,
"Eachelle"
,
"Eada"
,
"Eadie"
,
"Eadith"
,
"Ealasaid"
,
"Eartha"
,
"Easter"
,
"Eba"
,
"Ebba"
,
"Ebonee"
,
"Ebony"
,
"Eda"
,
"Eddi"
,
"Eddie"
,
"Eddy"
,
"Ede"
,
"Edee"
,
"Edeline"
,
"Eden"
,
"Edi"
,
"Edie"
,
"Edin"
,
"Edita"
,
"Edith"
,
"Editha"
,
"Edithe"
,
"Ediva"
,
"Edna"
,
"Edwina"
,
"Edy"
,
"Edyth"
,
"Edythe"
,
"Effie"
,
"Eileen"
,
"Eilis"
,
"Eimile"
,
"Eirena"
,
"Ekaterina"
,
"Elaina"
,
"Elaine"
,
"Elana"
,
"Elane"
,
"Elayne"
,
"Elberta"
,
"Elbertina"
,
"Elbertine"
,
"Eleanor"
,
"Eleanora"
,
"Eleanore"
,
"Electra"
,
"Eleen"
,
"Elena"
,
"Elene"
,
"Eleni"
,
"Elenore"
,
"Eleonora"
,
"Eleonore"
,
"Elfie"
,
"Elfreda"
,
"Elfrida"
,
"Elfrieda"
,
"Elga"
,
"Elianora"
,
"Elianore"
,
"Elicia"
,
"Elie"
,
"Elinor"
,
"Elinore"
,
"Elisa"
,
"Elisabet"
,
"Elisabeth"
,
"Elisabetta"
,
"Elise"
,
"Elisha"
,
"Elissa"
,
"Elita"
,
"Eliza"
,
"Elizabet"
,
"Elizabeth"
,
"Elka"
,
"Elke"
,
"Ella"
,
"Elladine"
,
"Elle"
,
"Ellen"
,
"Ellene"
,
"Ellette"
,
"Elli"
,
"Ellie"
,
"Ellissa"
,
"Elly"
,
"Ellyn"
,
"Ellynn"
,
"Elmira"
,
"Elna"
,
"Elnora"
,
"Elnore"
,
"Eloisa"
,
"Eloise"
,
"Elonore"
,
"Elora"
,
"Elsa"
,
"Elsbeth"
,
"Else"
,
"Elset"
,
"Elsey"
,
"Elsi"
,
"Elsie"
,
"Elsinore"
,
"Elspeth"
,
"Elsy"
,
"Elva"
,
"Elvera"
,
"Elvina"
,
"Elvira"
,
"Elwira"
,
"Elyn"
,
"Elyse"
,
"Elysee"
,
"Elysha"
,
"Elysia"
,
"Elyssa"
,
"Em"
,
"Ema"
,
"Emalee"
,
"Emalia"
,
"Emelda"
,
"Emelia"
,
"Emelina"
,
"Emeline"
,
"Emelita"
,
"Emelyne"
,
"Emera"
,
"Emilee"
,
"Emili"
,
"Emilia"
,
"Emilie"
,
"Emiline"
,
"Emily"
,
"Emlyn"
,
"Emlynn"
,
"Emlynne"
,
"Emma"
,
"Emmalee"
,
"Emmaline"
,
"Emmalyn"
,
"Emmalynn"
,
"Emmalynne"
,
"Emmeline"
,
"Emmey"
,
"Emmi"
,
"Emmie"
,
"Emmy"
,
"Emmye"
,
"Emogene"
,
"Emyle"
,
"Emylee"
,
"Engracia"
,
"Enid"
,
"Enrica"
,
"Enrichetta"
,
"Enrika"
,
"Enriqueta"
,
"Eolanda"
,
"Eolande"
,
"Eran"
,
"Erda"
,
"Erena"
,
"Erica"
,
"Ericha"
,
"Ericka"
,
"Erika"
,
"Erin"
,
"Erina"
,
"Erinn"
,
"Erinna"
,
"Erma"
,
"Ermengarde"
,
"Ermentrude"
,
"Ermina"
,
"Erminia"
,
"Erminie"
,
"Erna"
,
"Ernaline"
,
"Ernesta"
,
"Ernestine"
,
"Ertha"
,
"Eryn"
,
"Esma"
,
"Esmaria"
,
"Esme"
,
"Esmeralda"
,
"Essa"
,
"Essie"
,
"Essy"
,
"Esta"
,
"Estel"
,
"Estele"
,
"Estell"
,
"Estella"
,
"Estelle"
,
"Ester"
,
"Esther"
,
"Estrella"
,
"Estrellita"
,
"Ethel"
,
"Ethelda"
,
"Ethelin"
,
"Ethelind"
,
"Etheline"
,
"Ethelyn"
,
"Ethyl"
,
"Etta"
,
"Etti"
,
"Ettie"
,
"Etty"
,
"Eudora"
,
"Eugenia"
,
"Eugenie"
,
"Eugine"
,
"Eula"
,
"Eulalie"
,
"Eunice"
,
"Euphemia"
,
"Eustacia"
,
"Eva"
,
"Evaleen"
,
"Evangelia"
,
"Evangelin"
,
"Evangelina"
,
"Evangeline"
,
"Evania"
,
"Evanne"
,
"Eve"
,
"Eveleen"
,
"Evelina"
,
"Eveline"
,
"Evelyn"
,
"Evey"
,
"Evie"
,
"Evita"
,
"Evonne"
,
"Evvie"
,
"Evvy"
,
"Evy"
,
"Eyde"
,
"Eydie"
,
"Ezmeralda"
,
"Fae"
,
"Faina"
,
"Faith"
,
"Fallon"
,
"Fan"
,
"Fanchette"
,
"Fanchon"
,
"Fancie"
,
"Fancy"
,
"Fanechka"
,
"Fania"
,
"Fanni"
,
"Fannie"
,
"Fanny"
,
"Fanya"
,
"Fara"
,
"Farah"
,
"Farand"
,
"Farica"
,
"Farra"
,
"Farrah"
,
"Farrand"
,
"Faun"
,
"Faunie"
,
"Faustina"
,
"Faustine"
,
"Fawn"
,
"Fawne"
,
"Fawnia"
,
"Fay"
,
"Faydra"
,
"Faye"
,
"Fayette"
,
"Fayina"
,
"Fayre"
,
"Fayth"
,
"Faythe"
,
"Federica"
,
"Fedora"
,
"Felecia"
,
"Felicdad"
,
"Felice"
,
"Felicia"
,
"Felicity"
,
"Felicle"
,
"Felipa"
,
"Felisha"
,
"Felita"
,
"Feliza"
,
"Fenelia"
,
"Feodora"
,
"Ferdinanda"
,
"Ferdinande"
,
"Fern"
,
"Fernanda"
,
"Fernande"
,
"Fernandina"
,
"Ferne"
,
"Fey"
,
"Fiann"
,
"Fianna"
,
"Fidela"
,
"Fidelia"
,
"Fidelity"
,
"Fifi"
,
"Fifine"
,
"Filia"
,
"Filide"
,
"Filippa"
,
"Fina"
,
"Fiona"
,
"Fionna"
,
"Fionnula"
,
"Fiorenze"
,
"Fleur"
,
"Fleurette"
,
"Flo"
,
"Flor"
,
"Flora"
,
"Florance"
,
"Flore"
,
"Florella"
,
"Florence"
,
"Florencia"
,
"Florentia"
,
"Florenza"
,
"Florette"
,
"Flori"
,
"Floria"
,
"Florida"
,
"Florie"
,
"Florina"
,
"Florinda"
,
"Floris"
,
"Florri"
,
"Florrie"
,
"Florry"
,
"Flory"
,
"Flossi"
,
"Flossie"
,
"Flossy"
,
"Flss"
,
"Fran"
,
"Francene"
,
"Frances"
,
"Francesca"
,
"Francine"
,
"Francisca"
,
"Franciska"
,
"Francoise"
,
"Francyne"
,
"Frank"
,
"Frankie"
,
"Franky"
,
"Franni"
,
"Frannie"
,
"Franny"
,
"Frayda"
,
"Fred"
,
"Freda"
,
"Freddi"
,
"Freddie"
,
"Freddy"
,
"Fredelia"
,
"Frederica"
,
"Fredericka"
,
"Frederique"
,
"Fredi"
,
"Fredia"
,
"Fredra"
,
"Fredrika"
,
"Freida"
,
"Frieda"
,
"Friederike"
,
"Fulvia"
,
"Gabbey"
,
"Gabbi"
,
"Gabbie"
,
"Gabey"
,
"Gabi"
,
"Gabie"
,
"Gabriel"
,
"Gabriela"
,
"Gabriell"
,
"Gabriella"
,
"Gabrielle"
,
"Gabriellia"
,
"Gabrila"
,
"Gaby"
,
"Gae"
,
"Gael"
,
"Gail"
,
"Gale"
,
"Gale"
,
"Galina"
,
"Garland"
,
"Garnet"
,
"Garnette"
,
"Gates"
,
"Gavra"
,
"Gavrielle"
,
"Gay"
,
"Gaye"
,
"Gayel"
,
"Gayla"
,
"Gayle"
,
"Gayleen"
,
"Gaylene"
,
"Gaynor"
,
"Gelya"
,
"Gena"
,
"Gene"
,
"Geneva"
,
"Genevieve"
,
"Genevra"
,
"Genia"
,
"Genna"
,
"Genni"
,
"Gennie"
,
"Gennifer"
,
"Genny"
,
"Genovera"
,
"Genvieve"
,
"George"
,
"Georgeanna"
,
"Georgeanne"
,
"Georgena"
,
"Georgeta"
,
"Georgetta"
,
"Georgette"
,
"Georgia"
,
"Georgiana"
,
"Georgianna"
,
"Georgianne"
,
"Georgie"
,
"Georgina"
,
"Georgine"
,
"Geralda"
,
"Geraldine"
,
"Gerda"
,
"Gerhardine"
,
"Geri"
,
"Gerianna"
,
"Gerianne"
,
"Gerladina"
,
"Germain"
,
"Germaine"
,
"Germana"
,
"Gerri"
,
"Gerrie"
,
"Gerrilee"
,
"Gerry"
,
"Gert"
,
"Gerta"
,
"Gerti"
,
"Gertie"
,
"Gertrud"
,
"Gertruda"
,
"Gertrude"
,
"Gertrudis"
,
"Gerty"
,
"Giacinta"
,
"Giana"
,
"Gianina"
,
"Gianna"
,
"Gigi"
,
"Gilberta"
,
"Gilberte"
,
"Gilbertina"
,
"Gilbertine"
,
"Gilda"
,
"Gilemette"
,
"Gill"
,
"Gillan"
,
"Gilli"
,
"Gillian"
,
"Gillie"
,
"Gilligan"
,
"Gilly"
,
"Gina"
,
"Ginelle"
,
"Ginevra"
,
"Ginger"
,
"Ginni"
,
"Ginnie"
,
"Ginnifer"
,
"Ginny"
,
"Giorgia"
,
"Giovanna"
,
"Gipsy"
,
"Giralda"
,
"Gisela"
,
"Gisele"
,
"Gisella"
,
"Giselle"
,
"Giuditta"
,
"Giulia"
,
"Giulietta"
,
"Giustina"
,
"Gizela"
,
"Glad"
,
"Gladi"
,
"Gladys"
,
"Gleda"
,
"Glen"
,
"Glenda"
,
"Glenine"
,
"Glenn"
,
"Glenna"
,
"Glennie"
,
"Glennis"
,
"Glori"
,
"Gloria"
,
"Gloriana"
,
"Gloriane"
,
"Glory"
,
"Glyn"
,
"Glynda"
,
"Glynis"
,
"Glynnis"
,
"Gnni"
,
"Godiva"
,
"Golda"
,
"Goldarina"
,
"Goldi"
,
"Goldia"
,
"Goldie"
,
"Goldina"
,
"Goldy"
,
"Grace"
,
"Gracia"
,
"Gracie"
,
"Grata"
,
"Gratia"
,
"Gratiana"
,
"Gray"
,
"Grayce"
,
"Grazia"
,
"Greer"
,
"Greta"
,
"Gretal"
,
"Gretchen"
,
"Grete"
,
"Gretel"
,
"Grethel"
,
"Gretna"
,
"Gretta"
,
"Grier"
,
"Griselda"
,
"Grissel"
,
"Guendolen"
,
"Guenevere"
,
"Guenna"
,
"Guglielma"
,
"Gui"
,
"Guillema"
,
"Guillemette"
,
"Guinevere"
,
"Guinna"
,
"Gunilla"
,
"Gus"
,
"Gusella"
,
"Gussi"
,
"Gussie"
,
"Gussy"
,
"Gusta"
,
"Gusti"
,
"Gustie"
,
"Gusty"
,
"Gwen"
,
"Gwendolen"
,
"Gwendolin"
,
"Gwendolyn"
,
"Gweneth"
,
"Gwenette"
,
"Gwenneth"
,
"Gwenni"
,
"Gwennie"
,
"Gwenny"
,
"Gwenora"
,
"Gwenore"
,
"Gwyn"
,
"Gwyneth"
,
"Gwynne"
,
"Gypsy"
,
"Hadria"
,
"Hailee"
,
"Haily"
,
"Haleigh"
,
"Halette"
,
"Haley"
,
"Hali"
,
"Halie"
,
"Halimeda"
,
"Halley"
,
"Halli"
,
"Hallie"
,
"Hally"
,
"Hana"
,
"Hanna"
,
"Hannah"
,
"Hanni"
,
"Hannie"
,
"Hannis"
,
"Hanny"
,
"Happy"
,
"Harlene"
,
"Harley"
,
"Harli"
,
"Harlie"
,
"Harmonia"
,
"Harmonie"
,
"Harmony"
,
"Harri"
,
"Harrie"
,
"Harriet"
,
"Harriett"
,
"Harrietta"
,
"Harriette"
,
"Harriot"
,
"Harriott"
,
"Hatti"
,
"Hattie"
,
"Hatty"
,
"Hayley"
,
"Hazel"
,
"Heath"
,
"Heather"
,
"Heda"
,
"Hedda"
,
"Heddi"
,
"Heddie"
,
"Hedi"
,
"Hedvig"
,
"Hedvige"
,
"Hedwig"
,
"Hedwiga"
,
"Hedy"
,
"Heida"
,
"Heidi"
,
"Heidie"
,
"Helaina"
,
"Helaine"
,
"Helen"
,
"Helen-Elizabeth"
,
"Helena"
,
"Helene"
,
"Helenka"
,
"Helga"
,
"Helge"
,
"Helli"
,
"Heloise"
,
"Helsa"
,
"Helyn"
,
"Hendrika"
,
"Henka"
,
"Henrie"
,
"Henrieta"
,
"Henrietta"
,
"Henriette"
,
"Henryetta"
,
"Hephzibah"
,
"Hermia"
,
"Hermina"
,
"Hermine"
,
"Herminia"
,
"Hermione"
,
"Herta"
,
"Hertha"
,
"Hester"
,
"Hesther"
,
"Hestia"
,
"Hetti"
,
"Hettie"
,
"Hetty"
,
"Hilary"
,
"Hilda"
,
"Hildagard"
,
"Hildagarde"
,
"Hilde"
,
"Hildegaard"
,
"Hildegarde"
,
"Hildy"
,
"Hillary"
,
"Hilliary"
,
"Hinda"
,
"Holli"
,
"Hollie"
,
"Holly"
,
"Holly-Anne"
,
"Hollyanne"
,
"Honey"
,
"Honor"
,
"Honoria"
,
"Hope"
,
"Horatia"
,
"Hortense"
,
"Hortensia"
,
"Hulda"
,
"Hyacinth"
,
"Hyacintha"
,
"Hyacinthe"
,
"Hyacinthia"
,
"Hyacinthie"
,
"Hynda"
,
"Ianthe"
,
"Ibbie"
,
"Ibby"
,
"Ida"
,
"Idalia"
,
"Idalina"
,
"Idaline"
,
"Idell"
,
"Idelle"
,
"Idette"
,
"Ileana"
,
"Ileane"
,
"Ilene"
,
"Ilise"
,
"Ilka"
,
"Illa"
,
"Ilsa"
,
"Ilse"
,
"Ilysa"
,
"Ilyse"
,
"Ilyssa"
,
"Imelda"
,
"Imogen"
,
"Imogene"
,
"Imojean"
,
"Ina"
,
"Indira"
,
"Ines"
,
"Inesita"
,
"Inessa"
,
"Inez"
,
"Inga"
,
"Ingaberg"
,
"Ingaborg"
,
"Inge"
,
"Ingeberg"
,
"Ingeborg"
,
"Inger"
,
"Ingrid"
,
"Ingunna"
,
"Inna"
,
"Iolande"
,
"Iolanthe"
,
"Iona"
,
"Iormina"
,
"Ira"
,
"Irena"
,
"Irene"
,
"Irina"
,
"Iris"
,
"Irita"
,
"Irma"
,
"Isa"
,
"Isabel"
,
"Isabelita"
,
"Isabella"
,
"Isabelle"
,
"Isadora"
,
"Isahella"
,
"Iseabal"
,
"Isidora"
,
"Isis"
,
"Isobel"
,
"Issi"
,
"Issie"
,
"Issy"
,
"Ivett"
,
"Ivette"
,
"Ivie"
,
"Ivonne"
,
"Ivory"
,
"Ivy"
,
"Izabel"
,
"Jacenta"
,
"Jacinda"
,
"Jacinta"
,
"Jacintha"
,
"Jacinthe"
,
"Jackelyn"
,
"Jacki"
,
"Jackie"
,
"Jacklin"
,
"Jacklyn"
,
"Jackquelin"
,
"Jackqueline"
,
"Jacky"
,
"Jaclin"
,
"Jaclyn"
,
"Jacquelin"
,
"Jacqueline"
,
"Jacquelyn"
,
"Jacquelynn"
,
"Jacquenetta"
,
"Jacquenette"
,
"Jacquetta"
,
"Jacquette"
,
"Jacqui"
,
"Jacquie"
,
"Jacynth"
,
"Jada"
,
"Jade"
,
"Jaime"
,
"Jaimie"
,
"Jaine"
,
"Jami"
,
"Jamie"
,
"Jamima"
,
"Jammie"
,
"Jan"
,
"Jana"
,
"Janaya"
,
"Janaye"
,
"Jandy"
,
"Jane"
,
"Janean"
,
"Janeczka"
,
"Janeen"
,
"Janel"
,
"Janela"
,
"Janella"
,
"Janelle"
,
"Janene"
,
"Janenna"
,
"Janessa"
,
"Janet"
,
"Janeta"
,
"Janetta"
,
"Janette"
,
"Janeva"
,
"Janey"
,
"Jania"
,
"Janice"
,
"Janie"
,
"Janifer"
,
"Janina"
,
"Janine"
,
"Janis"
,
"Janith"
,
"Janka"
,
"Janna"
,
"Jannel"
,
"Jannelle"
,
"Janot"
,
"Jany"
,
"Jaquelin"
,
"Jaquelyn"
,
"Jaquenetta"
,
"Jaquenette"
,
"Jaquith"
,
"Jasmin"
,
"Jasmina"
,
"Jasmine"
,
"Jayme"
,
"Jaymee"
,
"Jayne"
,
"Jaynell"
,
"Jazmin"
,
"Jean"
,
"Jeana"
,
"Jeane"
,
"Jeanelle"
,
"Jeanette"
,
"Jeanie"
,
"Jeanine"
,
"Jeanna"
,
"Jeanne"
,
"Jeannette"
,
"Jeannie"
,
"Jeannine"
,
"Jehanna"
,
"Jelene"
,
"Jemie"
,
"Jemima"
,
"Jemimah"
,
"Jemmie"
,
"Jemmy"
,
"Jen"
,
"Jena"
,
"Jenda"
,
"Jenelle"
,
"Jeni"
,
"Jenica"
,
"Jeniece"
,
"Jenifer"
,
"Jeniffer"
,
"Jenilee"
,
"Jenine"
,
"Jenn"
,
"Jenna"
,
"Jennee"
,
"Jennette"
,
"Jenni"
,
"Jennica"
,
"Jennie"
,
"Jennifer"
,
"Jennilee"
,
"Jennine"
,
"Jenny"
,
"Jeralee"
,
"Jere"
,
"Jeri"
,
"Jermaine"
,
"Jerrie"
,
"Jerrilee"
,
"Jerrilyn"
,
"Jerrine"
,
"Jerry"
,
"Jerrylee"
,
"Jess"
,
"Jessa"
,
"Jessalin"
,
"Jessalyn"
,
"Jessamine"
,
"Jessamyn"
,
"Jesse"
,
"Jesselyn"
,
"Jessi"
,
"Jessica"
,
"Jessie"
,
"Jessika"
,
"Jessy"
,
"Jewel"
,
"Jewell"
,
"Jewelle"
,
"Jill"
,
"Jillana"
,
"Jillane"
,
"Jillayne"
,
"Jilleen"
,
"Jillene"
,
"Jilli"
,
"Jillian"
,
"Jillie"
,
"Jilly"
,
"Jinny"
,
"Jo"
,
"Jo Ann"
,
"Jo-Ann"
,
"Jo-Anne"
,
"Joan"
,
"Joana"
,
"Joane"
,
"Joanie"
,
"Joann"
,
"Joanna"
,
"Joanne"
,
"Joannes"
,
"Jobey"
,
"Jobi"
,
"Jobie"
,
"Jobina"
,
"Joby"
,
"Jobye"
,
"Jobyna"
,
"Jocelin"
,
"Joceline"
,
"Jocelyn"
,
"Jocelyne"
,
"Jodee"
,
"Jodi"
,
"Jodie"
,
"Jody"
,
"Joeann"
,
"Joela"
,
"Joelie"
,
"Joell"
,
"Joella"
,
"Joelle"
,
"Joellen"
,
"Joelly"
,
"Joellyn"
,
"Joelynn"
,
"Joete"
,
"Joey"
,
"Johanna"
,
"Johannah"
,
"Johna"
,
"Johnath"
,
"Johnette"
,
"Johnna"
,
"Joice"
,
"Jojo"
,
"Jolee"
,
"Joleen"
,
"Jolene"
,
"Joletta"
,
"Joli"
,
"Jolie"
,
"Joline"
,
"Joly"
,
"Jolyn"
,
"Jolynn"
,
"Jonell"
,
"Joni"
,
"Jonie"
,
"Jonis"
,
"Jordain"
,
"Jordan"
,
"Jordana"
,
"Jordanna"
,
"Jorey"
,
"Jori"
,
"Jorie"
,
"Jorrie"
,
"Jorry"
,
"Joscelin"
,
"Josee"
,
"Josefa"
,
"Josefina"
,
"Josepha"
,
"Josephina"
,
"Josephine"
,
"Josey"
,
"Josi"
,
"Josie"
,
"Josselyn"
,
"Josy"
,
"Jourdan"
,
"Joy"
,
"Joya"
,
"Joyan"
,
"Joyann"
,
"Joyce"
,
"Joycelin"
,
"Joye"
,
"Jsandye"
,
"Juana"
,
"Juanita"
,
"Judi"
,
"Judie"
,
"Judith"
,
"Juditha"
,
"Judy"
,
"Judye"
,
"Juieta"
,
"Julee"
,
"Juli"
,
"Julia"
,
"Juliana"
,
"Juliane"
,
"Juliann"
,
"Julianna"
,
"Julianne"
,
"Julie"
,
"Julienne"
,
"Juliet"
,
"Julieta"
,
"Julietta"
,
"Juliette"
,
"Julina"
,
"Juline"
,
"Julissa"
,
"Julita"
,
"June"
,
"Junette"
,
"Junia"
,
"Junie"
,
"Junina"
,
"Justina"
,
"Justine"
,
"Justinn"
,
"Jyoti"
,
"Kacey"
,
"Kacie"
,
"Kacy"
,
"Kaela"
,
"Kai"
,
"Kaia"
,
"Kaila"
,
"Kaile"
,
"Kailey"
,
"Kaitlin"
,
"Kaitlyn"
,
"Kaitlynn"
,
"Kaja"
,
"Kakalina"
,
"Kala"
,
"Kaleena"
,
"Kali"
,
"Kalie"
,
"Kalila"
,
"Kalina"
,
"Kalinda"
,
"Kalindi"
,
"Kalli"
,
"Kally"
,
"Kameko"
,
"Kamila"
,
"Kamilah"
,
"Kamillah"
,
"Kandace"
,
"Kandy"
,
"Kania"
,
"Kanya"
,
"Kara"
,
"Kara-Lynn"
,
"Karalee"
,
"Karalynn"
,
"Kare"
,
"Karee"
,
"Karel"
,
"Karen"
,
"Karena"
,
"Kari"
,
"Karia"
,
"Karie"
,
"Karil"
,
"Karilynn"
,
"Karin"
,
"Karina"
,
"Karine"
,
"Kariotta"
,
"Karisa"
,
"Karissa"
,
"Karita"
,
"Karla"
,
"Karlee"
,
"Karleen"
,
"Karlen"
,
"Karlene"
,
"Karlie"
,
"Karlotta"
,
"Karlotte"
,
"Karly"
,
"Karlyn"
,
"Karmen"
,
"Karna"
,
"Karol"
,
"Karola"
,
"Karole"
,
"Karolina"
,
"Karoline"
,
"Karoly"
,
"Karon"
,
"Karrah"
,
"Karrie"
,
"Karry"
,
"Kary"
,
"Karyl"
,
"Karylin"
,
"Karyn"
,
"Kasey"
,
"Kass"
,
"Kassandra"
,
"Kassey"
,
"Kassi"
,
"Kassia"
,
"Kassie"
,
"Kat"
,
"Kata"
,
"Katalin"
,
"Kate"
,
"Katee"
,
"Katerina"
,
"Katerine"
,
"Katey"
,
"Kath"
,
"Katha"
,
"Katharina"
,
"Katharine"
,
"Katharyn"
,
"Kathe"
,
"Katherina"
,
"Katherine"
,
"Katheryn"
,
"Kathi"
,
"Kathie"
,
"Kathleen"
,
"Kathlin"
,
"Kathrine"
,
"Kathryn"
,
"Kathryne"
,
"Kathy"
,
"Kathye"
,
"Kati"
,
"Katie"
,
"Katina"
,
"Katine"
,
"Katinka"
,
"Katleen"
,
"Katlin"
,
"Katrina"
,
"Katrine"
,
"Katrinka"
,
"Katti"
,
"Kattie"
,
"Katuscha"
,
"Katusha"
,
"Katy"
,
"Katya"
,
"Kay"
,
"Kaycee"
,
"Kaye"
,
"Kayla"
,
"Kayle"
,
"Kaylee"
,
"Kayley"
,
"Kaylil"
,
"Kaylyn"
,
"Keeley"
,
"Keelia"
,
"Keely"
,
"Kelcey"
,
"Kelci"
,
"Kelcie"
,
"Kelcy"
,
"Kelila"
,
"Kellen"
,
"Kelley"
,
"Kelli"
,
"Kellia"
,
"Kellie"
,
"Kellina"
,
"Kellsie"
,
"Kelly"
,
"Kellyann"
,
"Kelsey"
,
"Kelsi"
,
"Kelsy"
,
"Kendra"
,
"Kendre"
,
"Kenna"
,
"Keri"
,
"Keriann"
,
"Kerianne"
,
"Kerri"
,
"Kerrie"
,
"Kerrill"
,
"Kerrin"
,
"Kerry"
,
"Kerstin"
,
"Kesley"
,
"Keslie"
,
"Kessia"
,
"Kessiah"
,
"Ketti"
,
"Kettie"
,
"Ketty"
,
"Kevina"
,
"Kevyn"
,
"Ki"
,
"Kiah"
,
"Kial"
,
"Kiele"
,
"Kiersten"
,
"Kikelia"
,
"Kiley"
,
"Kim"
,
"Kimberlee"
,
"Kimberley"
,
"Kimberli"
,
"Kimberly"
,
"Kimberlyn"
,
"Kimbra"
,
"Kimmi"
,
"Kimmie"
,
"Kimmy"
,
"Kinna"
,
"Kip"
,
"Kipp"
,
"Kippie"
,
"Kippy"
,
"Kira"
,
"Kirbee"
,
"Kirbie"
,
"Kirby"
,
"Kiri"
,
"Kirsten"
,
"Kirsteni"
,
"Kirsti"
,
"Kirstin"
,
"Kirstyn"
,
"Kissee"
,
"Kissiah"
,
"Kissie"
,
"Kit"
,
"Kitti"
,
"Kittie"
,
"Kitty"
,
"Kizzee"
,
"Kizzie"
,
"Klara"
,
"Klarika"
,
"Klarrisa"
,
"Konstance"
,
"Konstanze"
,
"Koo"
,
"Kora"
,
"Koral"
,
"Koralle"
,
"Kordula"
,
"Kore"
,
"Korella"
,
"Koren"
,
"Koressa"
,
"Kori"
,
"Korie"
,
"Korney"
,
"Korrie"
,
"Korry"
,
"Kris"
,
"Krissie"
,
"Krissy"
,
"Krista"
,
"Kristal"
,
"Kristan"
,
"Kriste"
,
"Kristel"
,
"Kristen"
,
"Kristi"
,
"Kristien"
,
"Kristin"
,
"Kristina"
,
"Kristine"
,
"Kristy"
,
"Kristyn"
,
"Krysta"
,
"Krystal"
,
"Krystalle"
,
"Krystle"
,
"Krystyna"
,
"Kyla"
,
"Kyle"
,
"Kylen"
,
"Kylie"
,
"Kylila"
,
"Kylynn"
,
"Kym"
,
"Kynthia"
,
"Kyrstin"
,
"La Verne"
,
"Lacee"
,
"Lacey"
,
"Lacie"
,
"Lacy"
,
"Ladonna"
,
"Laetitia"
,
"Laina"
,
"Lainey"
,
"Lana"
,
"Lanae"
,
"Lane"
,
"Lanette"
,
"Laney"
,
"Lani"
,
"Lanie"
,
"Lanita"
,
"Lanna"
,
"Lanni"
,
"Lanny"
,
"Lara"
,
"Laraine"
,
"Lari"
,
"Larina"
,
"Larine"
,
"Larisa"
,
"Larissa"
,
"Lark"
,
"Laryssa"
,
"Latashia"
,
"Latia"
,
"Latisha"
,
"Latrena"
,
"Latrina"
,
"Laura"
,
"Lauraine"
,
"Laural"
,
"Lauralee"
,
"Laure"
,
"Lauree"
,
"Laureen"
,
"Laurel"
,
"Laurella"
,
"Lauren"
,
"Laurena"
,
"Laurene"
,
"Lauretta"
,
"Laurette"
,
"Lauri"
,
"Laurianne"
,
"Laurice"
,
"Laurie"
,
"Lauryn"
,
"Lavena"
,
"Laverna"
,
"Laverne"
,
"Lavina"
,
"Lavinia"
,
"Lavinie"
,
"Layla"
,
"Layne"
,
"Layney"
,
"Lea"
,
"Leah"
,
"Leandra"
,
"Leann"
,
"Leanna"
,
"Leanor"
,
"Leanora"
,
"Lebbie"
,
"Leda"
,
"Lee"
,
"Leeann"
,
"Leeanne"
,
"Leela"
,
"Leelah"
,
"Leena"
,
"Leesa"
,
"Leese"
,
"Legra"
,
"Leia"
,
"Leigh"
,
"Leigha"
,
"Leila"
,
"Leilah"
,
"Leisha"
,
"Lela"
,
"Lelah"
,
"Leland"
,
"Lelia"
,
"Lena"
,
"Lenee"
,
"Lenette"
,
"Lenka"
,
"Lenna"
,
"Lenora"
,
"Lenore"
,
"Leodora"
,
"Leoine"
,
"Leola"
,
"Leoline"
,
"Leona"
,
"Leonanie"
,
"Leone"
,
"Leonelle"
,
"Leonie"
,
"Leonora"
,
"Leonore"
,
"Leontine"
,
"Leontyne"
,
"Leora"
,
"Leshia"
,
"Lesley"
,
"Lesli"
,
"Leslie"
,
"Lesly"
,
"Lesya"
,
"Leta"
,
"Lethia"
,
"Leticia"
,
"Letisha"
,
"Letitia"
,
"Letizia"
,
"Letta"
,
"Letti"
,
"Lettie"
,
"Letty"
,
"Lexi"
,
"Lexie"
,
"Lexine"
,
"Lexis"
,
"Lexy"
,
"Leyla"
,
"Lezlie"
,
"Lia"
,
"Lian"
,
"Liana"
,
"Liane"
,
"Lianna"
,
"Lianne"
,
"Lib"
,
"Libbey"
,
"Libbi"
,
"Libbie"
,
"Libby"
,
"Licha"
,
"Lida"
,
"Lidia"
,
"Liesa"
,
"Lil"
,
"Lila"
,
"Lilah"
,
"Lilas"
,
"Lilia"
,
"Lilian"
,
"Liliane"
,
"Lilias"
,
"Lilith"
,
"Lilla"
,
"Lilli"
,
"Lillian"
,
"Lillis"
,
"Lilllie"
,
"Lilly"
,
"Lily"
,
"Lilyan"
,
"Lin"
,
"Lina"
,
"Lind"
,
"Linda"
,
"Lindi"
,
"Lindie"
,
"Lindsay"
,
"Lindsey"
,
"Lindsy"
,
"Lindy"
,
"Linea"
,
"Linell"
,
"Linet"
,
"Linette"
,
"Linn"
,
"Linnea"
,
"Linnell"
,
"Linnet"
,
"Linnie"
,
"Linzy"
,
"Lira"
,
"Lisa"
,
"Lisabeth"
,
"Lisbeth"
,
"Lise"
,
"Lisetta"
,
"Lisette"
,
"Lisha"
,
"Lishe"
,
"Lissa"
,
"Lissi"
,
"Lissie"
,
"Lissy"
,
"Lita"
,
"Liuka"
,
"Liv"
,
"Liva"
,
"Livia"
,
"Livvie"
,
"Livvy"
,
"Livvyy"
,
"Livy"
,
"Liz"
,
"Liza"
,
"Lizabeth"
,
"Lizbeth"
,
"Lizette"
,
"Lizzie"
,
"Lizzy"
,
"Loella"
,
"Lois"
,
"Loise"
,
"Lola"
,
"Loleta"
,
"Lolita"
,
"Lolly"
,
"Lona"
,
"Lonee"
,
"Loni"
,
"Lonna"
,
"Lonni"
,
"Lonnie"
,
"Lora"
,
"Lorain"
,
"Loraine"
,
"Loralee"
,
"Loralie"
,
"Loralyn"
,
"Loree"
,
"Loreen"
,
"Lorelei"
,
"Lorelle"
,
"Loren"
,
"Lorena"
,
"Lorene"
,
"Lorenza"
,
"Loretta"
,
"Lorette"
,
"Lori"
,
"Loria"
,
"Lorianna"
,
"Lorianne"
,
"Lorie"
,
"Lorilee"
,
"Lorilyn"
,
"Lorinda"
,
"Lorine"
,
"Lorita"
,
"Lorna"
,
"Lorne"
,
"Lorraine"
,
"Lorrayne"
,
"Lorri"
,
"Lorrie"
,
"Lorrin"
,
"Lorry"
,
"Lory"
,
"Lotta"
,
"Lotte"
,
"Lotti"
,
"Lottie"
,
"Lotty"
,
"Lou"
,
"Louella"
,
"Louisa"
,
"Louise"
,
"Louisette"
,
"Loutitia"
,
"Lu"
,
"Luce"
,
"Luci"
,
"Lucia"
,
"Luciana"
,
"Lucie"
,
"Lucienne"
,
"Lucila"
,
"Lucilia"
,
"Lucille"
,
"Lucina"
,
"Lucinda"
,
"Lucine"
,
"Lucita"
,
"Lucky"
,
"Lucretia"
,
"Lucy"
,
"Ludovika"
,
"Luella"
,
"Luelle"
,
"Luisa"
,
"Luise"
,
"Lula"
,
"Lulita"
,
"Lulu"
,
"Lura"
,
"Lurette"
,
"Lurleen"
,
"Lurlene"
,
"Lurline"
,
"Lusa"
,
"Luz"
,
"Lyda"
,
"Lydia"
,
"Lydie"
,
"Lyn"
,
"Lynda"
,
"Lynde"
,
"Lyndel"
,
"Lyndell"
,
"Lyndsay"
,
"Lyndsey"
,
"Lyndsie"
,
"Lyndy"
,
"Lynea"
,
"Lynelle"
,
"Lynett"
,
"Lynette"
,
"Lynn"
,
"Lynna"
,
"Lynne"
,
"Lynnea"
,
"Lynnell"
,
"Lynnelle"
,
"Lynnet"
,
"Lynnett"
,
"Lynnette"
,
"Lynsey"
,
"Lyssa"
,
"Mab"
,
"Mabel"
,
"Mabelle"
,
"Mable"
,
"Mada"
,
"Madalena"
,
"Madalyn"
,
"Maddalena"
,
"Maddi"
,
"Maddie"
,
"Maddy"
,
"Madel"
,
"Madelaine"
,
"Madeleine"
,
"Madelena"
,
"Madelene"
,
"Madelin"
,
"Madelina"
,
"Madeline"
,
"Madella"
,
"Madelle"
,
"Madelon"
,
"Madelyn"
,
"Madge"
,
"Madlen"
,
"Madlin"
,
"Madonna"
,
"Mady"
,
"Mae"
,
"Maegan"
,
"Mag"
,
"Magda"
,
"Magdaia"
,
"Magdalen"
,
"Magdalena"
,
"Magdalene"
,
"Maggee"
,
"Maggi"
,
"Maggie"
,
"Maggy"
,
"Mahala"
,
"Mahalia"
,
"Maia"
,
"Maible"
,
"Maiga"
,
"Maighdiln"
,
"Mair"
,
"Maire"
,
"Maisey"
,
"Maisie"
,
"Maitilde"
,
"Mala"
,
"Malanie"
,
"Malena"
,
"Malia"
,
"Malina"
,
"Malinda"
,
"Malinde"
,
"Malissa"
,
"Malissia"
,
"Mallissa"
,
"Mallorie"
,
"Mallory"
,
"Malorie"
,
"Malory"
,
"Malva"
,
"Malvina"
,
"Malynda"
,
"Mame"
,
"Mamie"
,
"Manda"
,
"Mandi"
,
"Mandie"
,
"Mandy"
,
"Manon"
,
"Manya"
,
"Mara"
,
"Marabel"
,
"Marcela"
,
"Marcelia"
,
"Marcella"
,
"Marcelle"
,
"Marcellina"
,
"Marcelline"
,
"Marchelle"
,
"Marci"
,
"Marcia"
,
"Marcie"
,
"Marcile"
,
"Marcille"
,
"Marcy"
,
"Mareah"
,
"Maren"
,
"Marena"
,
"Maressa"
,
"Marga"
,
"Margalit"
,
"Margalo"
,
"Margaret"
,
"Margareta"
,
"Margarete"
,
"Margaretha"
,
"Margarethe"
,
"Margaretta"
,
"Margarette"
,
"Margarita"
,
"Margaux"
,
"Marge"
,
"Margeaux"
,
"Margery"
,
"Marget"
,
"Margette"
,
"Margi"
,
"Margie"
,
"Margit"
,
"Margo"
,
"Margot"
,
"Margret"
,
"Marguerite"
,
"Margy"
,
"Mari"
,
"Maria"
,
"Mariam"
,
"Marian"
,
"Mariana"
,
"Mariann"
,
"Marianna"
,
"Marianne"
,
"Maribel"
,
"Maribelle"
,
"Maribeth"
,
"Marice"
,
"Maridel"
,
"Marie"
,
"Marie-Ann"
,
"Marie-Jeanne"
,
"Marieann"
,
"Mariejeanne"
,
"Mariel"
,
"Mariele"
,
"Marielle"
,
"Mariellen"
,
"Marietta"
,
"Mariette"
,
"Marigold"
,
"Marijo"
,
"Marika"
,
"Marilee"
,
"Marilin"
,
"Marillin"
,
"Marilyn"
,
"Marin"
,
"Marina"
,
"Marinna"
,
"Marion"
,
"Mariquilla"
,
"Maris"
,
"Marisa"
,
"Mariska"
,
"Marissa"
,
"Marita"
,
"Maritsa"
,
"Mariya"
,
"Marj"
,
"Marja"
,
"Marje"
,
"Marji"
,
"Marjie"
,
"Marjorie"
,
"Marjory"
,
"Marjy"
,
"Marketa"
,
"Marla"
,
"Marlane"
,
"Marleah"
,
"Marlee"
,
"Marleen"
,
"Marlena"
,
"Marlene"
,
"Marley"
,
"Marlie"
,
"Marline"
,
"Marlo"
,
"Marlyn"
,
"Marna"
,
"Marne"
,
"Marney"
,
"Marni"
,
"Marnia"
,
"Marnie"
,
"Marquita"
,
"Marrilee"
,
"Marris"
,
"Marrissa"
,
"Marsha"
,
"Marsiella"
,
"Marta"
,
"Martelle"
,
"Martguerita"
,
"Martha"
,
"Marthe"
,
"Marthena"
,
"Marti"
,
"Martica"
,
"Martie"
,
"Martina"
,
"Martita"
,
"Marty"
,
"Martynne"
,
"Mary"
,
"Marya"
,
"Maryann"
,
"Maryanna"
,
"Maryanne"
,
"Marybelle"
,
"Marybeth"
,
"Maryellen"
,
"Maryjane"
,
"Maryjo"
,
"Maryl"
,
"Marylee"
,
"Marylin"
,
"Marylinda"
,
"Marylou"
,
"Marylynne"
,
"Maryrose"
,
"Marys"
,
"Marysa"
,
"Masha"
,
"Matelda"
,
"Mathilda"
,
"Mathilde"
,
"Matilda"
,
"Matilde"
,
"Matti"
,
"Mattie"
,
"Matty"
,
"Maud"
,
"Maude"
,
"Maudie"
,
"Maura"
,
"Maure"
,
"Maureen"
,
"Maureene"
,
"Maurene"
,
"Maurine"
,
"Maurise"
,
"Maurita"
,
"Maurizia"
,
"Mavis"
,
"Mavra"
,
"Max"
,
"Maxi"
,
"Maxie"
,
"Maxine"
,
"Maxy"
,
"May"
,
"Maybelle"
,
"Maye"
,
"Mead"
,
"Meade"
,
"Meagan"
,
"Meaghan"
,
"Meara"
,
"Mechelle"
,
"Meg"
,
"Megan"
,
"Megen"
,
"Meggi"
,
"Meggie"
,
"Meggy"
,
"Meghan"
,
"Meghann"
,
"Mehetabel"
,
"Mei"
,
"Mel"
,
"Mela"
,
"Melamie"
,
"Melania"
,
"Melanie"
,
"Melantha"
,
"Melany"
,
"Melba"
,
"Melesa"
,
"Melessa"
,
"Melicent"
,
"Melina"
,
"Melinda"
,
"Melinde"
,
"Melisa"
,
"Melisande"
,
"Melisandra"
,
"Melisenda"
,
"Melisent"
,
"Melissa"
,
"Melisse"
,
"Melita"
,
"Melitta"
,
"Mella"
,
"Melli"
,
"Mellicent"
,
"Mellie"
,
"Mellisa"
,
"Mellisent"
,
"Melloney"
,
"Melly"
,
"Melodee"
,
"Melodie"
,
"Melody"
,
"Melonie"
,
"Melony"
,
"Melosa"
,
"Melva"
,
"Mercedes"
,
"Merci"
,
"Mercie"
,
"Mercy"
,
"Meredith"
,
"Meredithe"
,
"Meridel"
,
"Meridith"
,
"Meriel"
,
"Merilee"
,
"Merilyn"
,
"Meris"
,
"Merissa"
,
"Merl"
,
"Merla"
,
"Merle"
,
"Merlina"
,
"Merline"
,
"Merna"
,
"Merola"
,
"Merralee"
,
"Merridie"
,
"Merrie"
,
"Merrielle"
,
"Merrile"
,
"Merrilee"
,
"Merrili"
,
"Merrill"
,
"Merrily"
,
"Merry"
,
"Mersey"
,
"Meryl"
,
"Meta"
,
"Mia"
,
"Micaela"
,
"Michaela"
,
"Michaelina"
,
"Michaeline"
,
"Michaella"
,
"Michal"
,
"Michel"
,
"Michele"
,
"Michelina"
,
"Micheline"
,
"Michell"
,
"Michelle"
,
"Micki"
,
"Mickie"
,
"Micky"
,
"Midge"
,
"Mignon"
,
"Mignonne"
,
"Miguela"
,
"Miguelita"
,
"Mikaela"
,
"Mil"
,
"Mildred"
,
"Mildrid"
,
"Milena"
,
"Milicent"
,
"Milissent"
,
"Milka"
,
"Milli"
,
"Millicent"
,
"Millie"
,
"Millisent"
,
"Milly"
,
"Milzie"
,
"Mimi"
,
"Min"
,
"Mina"
,
"Minda"
,
"Mindy"
,
"Minerva"
,
"Minetta"
,
"Minette"
,
"Minna"
,
"Minnaminnie"
,
"Minne"
,
"Minni"
,
"Minnie"
,
"Minnnie"
,
"Minny"
,
"Minta"
,
"Miof Mela"
,
"Miquela"
,
"Mira"
,
"Mirabel"
,
"Mirabella"
,
"Mirabelle"
,
"Miran"
,
"Miranda"
,
"Mireielle"
,
"Mireille"
,
"Mirella"
,
"Mirelle"
,
"Miriam"
,
"Mirilla"
,
"Mirna"
,
"Misha"
,
"Missie"
,
"Missy"
,
"Misti"
,
"Misty"
,
"Mitzi"
,
"Modesta"
,
"Modestia"
,
"Modestine"
,
"Modesty"
,
"Moina"
,
"Moira"
,
"Moll"
,
"Mollee"
,
"Molli"
,
"Mollie"
,
"Molly"
,
"Mommy"
,
"Mona"
,
"Monah"
,
"Monica"
,
"Monika"
,
"Monique"
,
"Mora"
,
"Moreen"
,
"Morena"
,
"Morgan"
,
"Morgana"
,
"Morganica"
,
"Morganne"
,
"Morgen"
,
"Moria"
,
"Morissa"
,
"Morna"
,
"Moselle"
,
"Moyna"
,
"Moyra"
,
"Mozelle"
,
"Muffin"
,
"Mufi"
,
"Mufinella"
,
"Muire"
,
"Mureil"
,
"Murial"
,
"Muriel"
,
"Murielle"
,
"Myra"
,
"Myrah"
,
"Myranda"
,
"Myriam"
,
"Myrilla"
,
"Myrle"
,
"Myrlene"
,
"Myrna"
,
"Myrta"
,
"Myrtia"
,
"Myrtice"
,
"Myrtie"
,
"Myrtle"
,
"Nada"
,
"Nadean"
,
"Nadeen"
,
"Nadia"
,
"Nadine"
,
"Nadiya"
,
"Nady"
,
"Nadya"
,
"Nalani"
,
"Nan"
,
"Nana"
,
"Nananne"
,
"Nance"
,
"Nancee"
,
"Nancey"
,
"Nanci"
,
"Nancie"
,
"Nancy"
,
"Nanete"
,
"Nanette"
,
"Nani"
,
"Nanice"
,
"Nanine"
,
"Nannette"
,
"Nanni"
,
"Nannie"
,
"Nanny"
,
"Nanon"
,
"Naoma"
,
"Naomi"
,
"Nara"
,
"Nari"
,
"Nariko"
,
"Nat"
,
"Nata"
,
"Natala"
,
"Natalee"
,
"Natalie"
,
"Natalina"
,
"Nataline"
,
"Natalya"
,
"Natasha"
,
"Natassia"
,
"Nathalia"
,
"Nathalie"
,
"Natividad"
,
"Natka"
,
"Natty"
,
"Neala"
,
"Neda"
,
"Nedda"
,
"Nedi"
,
"Neely"
,
"Neila"
,
"Neile"
,
"Neilla"
,
"Neille"
,
"Nelia"
,
"Nelie"
,
"Nell"
,
"Nelle"
,
"Nelli"
,
"Nellie"
,
"Nelly"
,
"Nerissa"
,
"Nerita"
,
"Nert"
,
"Nerta"
,
"Nerte"
,
"Nerti"
,
"Nertie"
,
"Nerty"
,
"Nessa"
,
"Nessi"
,
"Nessie"
,
"Nessy"
,
"Nesta"
,
"Netta"
,
"Netti"
,
"Nettie"
,
"Nettle"
,
"Netty"
,
"Nevsa"
,
"Neysa"
,
"Nichol"
,
"Nichole"
,
"Nicholle"
,
"Nicki"
,
"Nickie"
,
"Nicky"
,
"Nicol"
,
"Nicola"
,
"Nicole"
,
"Nicolea"
,
"Nicolette"
,
"Nicoli"
,
"Nicolina"
,
"Nicoline"
,
"Nicolle"
,
"Nikaniki"
,
"Nike"
,
"Niki"
,
"Nikki"
,
"Nikkie"
,
"Nikoletta"
,
"Nikolia"
,
"Nina"
,
"Ninetta"
,
"Ninette"
,
"Ninnetta"
,
"Ninnette"
,
"Ninon"
,
"Nissa"
,
"Nisse"
,
"Nissie"
,
"Nissy"
,
"Nita"
,
"Nixie"
,
"Noami"
,
"Noel"
,
"Noelani"
,
"Noell"
,
"Noella"
,
"Noelle"
,
"Noellyn"
,
"Noelyn"
,
"Noemi"
,
"Nola"
,
"Nolana"
,
"Nolie"
,
"Nollie"
,
"Nomi"
,
"Nona"
,
"Nonah"
,
"Noni"
,
"Nonie"
,
"Nonna"
,
"Nonnah"
,
"Nora"
,
"Norah"
,
"Norean"
,
"Noreen"
,
"Norene"
,
"Norina"
,
"Norine"
,
"Norma"
,
"Norri"
,
"Norrie"
,
"Norry"
,
"Novelia"
,
"Nydia"
,
"Nyssa"
,
"Octavia"
,
"Odele"
,
"Odelia"
,
"Odelinda"
,
"Odella"
,
"Odelle"
,
"Odessa"
,
"Odetta"
,
"Odette"
,
"Odilia"
,
"Odille"
,
"Ofelia"
,
"Ofella"
,
"Ofilia"
,
"Ola"
,
"Olenka"
,
"Olga"
,
"Olia"
,
"Olimpia"
,
"Olive"
,
"Olivette"
,
"Olivia"
,
"Olivie"
,
"Oliy"
,
"Ollie"
,
"Olly"
,
"Olva"
,
"Olwen"
,
"Olympe"
,
"Olympia"
,
"Olympie"
,
"Ondrea"
,
"Oneida"
,
"Onida"
,
"Oona"
,
"Opal"
,
"Opalina"
,
"Opaline"
,
"Ophelia"
,
"Ophelie"
,
"Ora"
,
"Oralee"
,
"Oralia"
,
"Oralie"
,
"Oralla"
,
"Oralle"
,
"Orel"
,
"Orelee"
,
"Orelia"
,
"Orelie"
,
"Orella"
,
"Orelle"
,
"Oriana"
,
"Orly"
,
"Orsa"
,
"Orsola"
,
"Ortensia"
,
"Otha"
,
"Othelia"
,
"Othella"
,
"Othilia"
,
"Othilie"
,
"Ottilie"
,
"Page"
,
"Paige"
,
"Paloma"
,
"Pam"
,
"Pamela"
,
"Pamelina"
,
"Pamella"
,
"Pammi"
,
"Pammie"
,
"Pammy"
,
"Pandora"
,
"Pansie"
,
"Pansy"
,
"Paola"
,
"Paolina"
,
"Papagena"
,
"Pat"
,
"Patience"
,
"Patrica"
,
"Patrice"
,
"Patricia"
,
"Patrizia"
,
"Patsy"
,
"Patti"
,
"Pattie"
,
"Patty"
,
"Paula"
,
"Paule"
,
"Pauletta"
,
"Paulette"
,
"Pauli"
,
"Paulie"
,
"Paulina"
,
"Pauline"
,
"Paulita"
,
"Pauly"
,
"Pavia"
,
"Pavla"
,
"Pearl"
,
"Pearla"
,
"Pearle"
,
"Pearline"
,
"Peg"
,
"Pegeen"
,
"Peggi"
,
"Peggie"
,
"Peggy"
,
"Pen"
,
"Penelopa"
,
"Penelope"
,
"Penni"
,
"Pennie"
,
"Penny"
,
"Pepi"
,
"Pepita"
,
"Peri"
,
"Peria"
,
"Perl"
,
"Perla"
,
"Perle"
,
"Perri"
,
"Perrine"
,
"Perry"
,
"Persis"
,
"Pet"
,
"Peta"
,
"Petra"
,
"Petrina"
,
"Petronella"
,
"Petronia"
,
"Petronilla"
,
"Petronille"
,
"Petunia"
,
"Phaedra"
,
"Phaidra"
,
"Phebe"
,
"Phedra"
,
"Phelia"
,
"Phil"
,
"Philipa"
,
"Philippa"
,
"Philippe"
,
"Philippine"
,
"Philis"
,
"Phillida"
,
"Phillie"
,
"Phillis"
,
"Philly"
,
"Philomena"
,
"Phoebe"
,
"Phylis"
,
"Phyllida"
,
"Phyllis"
,
"Phyllys"
,
"Phylys"
,
"Pia"
,
"Pier"
,
"Pierette"
,
"Pierrette"
,
"Pietra"
,
"Piper"
,
"Pippa"
,
"Pippy"
,
"Polly"
,
"Pollyanna"
,
"Pooh"
,
"Poppy"
,
"Portia"
,
"Pris"
,
"Prisca"
,
"Priscella"
,
"Priscilla"
,
"Prissie"
,
"Pru"
,
"Prudence"
,
"Prudi"
,
"Prudy"
,
"Prue"
,
"Queenie"
,
"Quentin"
,
"Querida"
,
"Quinn"
,
"Quinta"
,
"Quintana"
,
"Quintilla"
,
"Quintina"
,
"Rachael"
,
"Rachel"
,
"Rachele"
,
"Rachelle"
,
"Rae"
,
"Raeann"
,
"Raf"
,
"Rafa"
,
"Rafaela"
,
"Rafaelia"
,
"Rafaelita"
,
"Rahal"
,
"Rahel"
,
"Raina"
,
"Raine"
,
"Rakel"
,
"Ralina"
,
"Ramona"
,
"Ramonda"
,
"Rana"
,
"Randa"
,
"Randee"
,
"Randene"
,
"Randi"
,
"Randie"
,
"Randy"
,
"Ranee"
,
"Rani"
,
"Rania"
,
"Ranice"
,
"Ranique"
,
"Ranna"
,
"Raphaela"
,
"Raquel"
,
"Raquela"
,
"Rasia"
,
"Rasla"
,
"Raven"
,
"Ray"
,
"Raychel"
,
"Raye"
,
"Rayna"
,
"Raynell"
,
"Rayshell"
,
"Rea"
,
"Reba"
,
"Rebbecca"
,
"Rebe"
,
"Rebeca"
,
"Rebecca"
,
"Rebecka"
,
"Rebeka"
,
"Rebekah"
,
"Rebekkah"
,
"Ree"
,
"Reeba"
,
"Reena"
,
"Reeta"
,
"Reeva"
,
"Regan"
,
"Reggi"
,
"Reggie"
,
"Regina"
,
"Regine"
,
"Reiko"
,
"Reina"
,
"Reine"
,
"Remy"
,
"Rena"
,
"Renae"
,
"Renata"
,
"Renate"
,
"Rene"
,
"Renee"
,
"Renell"
,
"Renelle"
,
"Renie"
,
"Rennie"
,
"Reta"
,
"Retha"
,
"Revkah"
,
"Rey"
,
"Reyna"
,
"Rhea"
,
"Rheba"
,
"Rheta"
,
"Rhetta"
,
"Rhiamon"
,
"Rhianna"
,
"Rhianon"
,
"Rhoda"
,
"Rhodia"
,
"Rhodie"
,
"Rhody"
,
"Rhona"
,
"Rhonda"
,
"Riane"
,
"Riannon"
,
"Rianon"
,
"Rica"
,
"Ricca"
,
"Rici"
,
"Ricki"
,
"Rickie"
,
"Ricky"
,
"Riki"
,
"Rikki"
,
"Rina"
,
"Risa"
,
"Rita"
,
"Riva"
,
"Rivalee"
,
"Rivi"
,
"Rivkah"
,
"Rivy"
,
"Roana"
,
"Roanna"
,
"Roanne"
,
"Robbi"
,
"Robbie"
,
"Robbin"
,
"Robby"
,
"Robbyn"
,
"Robena"
,
"Robenia"
,
"Roberta"
,
"Robin"
,
"Robina"
,
"Robinet"
,
"Robinett"
,
"Robinetta"
,
"Robinette"
,
"Robinia"
,
"Roby"
,
"Robyn"
,
"Roch"
,
"Rochell"
,
"Rochella"
,
"Rochelle"
,
"Rochette"
,
"Roda"
,
"Rodi"
,
"Rodie"
,
"Rodina"
,
"Rois"
,
"Romola"
,
"Romona"
,
"Romonda"
,
"Romy"
,
"Rona"
,
"Ronalda"
,
"Ronda"
,
"Ronica"
,
"Ronna"
,
"Ronni"
,
"Ronnica"
,
"Ronnie"
,
"Ronny"
,
"Roobbie"
,
"Rora"
,
"Rori"
,
"Rorie"
,
"Rory"
,
"Ros"
,
"Rosa"
,
"Rosabel"
,
"Rosabella"
,
"Rosabelle"
,
"Rosaleen"
,
"Rosalia"
,
"Rosalie"
,
"Rosalind"
,
"Rosalinda"
,
"Rosalinde"
,
"Rosaline"
,
"Rosalyn"
,
"Rosalynd"
,
"Rosamond"
,
"Rosamund"
,
"Rosana"
,
"Rosanna"
,
"Rosanne"
,
"Rose"
,
"Roseann"
,
"Roseanna"
,
"Roseanne"
,
"Roselia"
,
"Roselin"
,
"Roseline"
,
"Rosella"
,
"Roselle"
,
"Rosemaria"
,
"Rosemarie"
,
"Rosemary"
,
"Rosemonde"
,
"Rosene"
,
"Rosetta"
,
"Rosette"
,
"Roshelle"
,
"Rosie"
,
"Rosina"
,
"Rosita"
,
"Roslyn"
,
"Rosmunda"
,
"Rosy"
,
"Row"
,
"Rowe"
,
"Rowena"
,
"Roxana"
,
"Roxane"
,
"Roxanna"
,
"Roxanne"
,
"Roxi"
,
"Roxie"
,
"Roxine"
,
"Roxy"
,
"Roz"
,
"Rozalie"
,
"Rozalin"
,
"Rozamond"
,
"Rozanna"
,
"Rozanne"
,
"Roze"
,
"Rozele"
,
"Rozella"
,
"Rozelle"
,
"Rozina"
,
"Rubetta"
,
"Rubi"
,
"Rubia"
,
"Rubie"
,
"Rubina"
,
"Ruby"
,
"Ruperta"
,
"Ruth"
,
"Ruthann"
,
"Ruthanne"
,
"Ruthe"
,
"Ruthi"
,
"Ruthie"
,
"Ruthy"
,
"Ryann"
,
"Rycca"
,
"Saba"
,
"Sabina"
,
"Sabine"
,
"Sabra"
,
"Sabrina"
,
"Sacha"
,
"Sada"
,
"Sadella"
,
"Sadie"
,
"Sadye"
,
"Saidee"
,
"Sal"
,
"Salaidh"
,
"Sallee"
,
"Salli"
,
"Sallie"
,
"Sally"
,
"Sallyann"
,
"Sallyanne"
,
"Saloma"
,
"Salome"
,
"Salomi"
,
"Sam"
,
"Samantha"
,
"Samara"
,
"Samaria"
,
"Sammy"
,
"Sande"
,
"Sandi"
,
"Sandie"
,
"Sandra"
,
"Sandy"
,
"Sandye"
,
"Sapphira"
,
"Sapphire"
,
"Sara"
,
"Sara-Ann"
,
"Saraann"
,
"Sarah"
,
"Sarajane"
,
"Saree"
,
"Sarena"
,
"Sarene"
,
"Sarette"
,
"Sari"
,
"Sarina"
,
"Sarine"
,
"Sarita"
,
"Sascha"
,
"Sasha"
,
"Sashenka"
,
"Saudra"
,
"Saundra"
,
"Savina"
,
"Sayre"
,
"Scarlet"
,
"Scarlett"
,
"Sean"
,
"Seana"
,
"Seka"
,
"Sela"
,
"Selena"
,
"Selene"
,
"Selestina"
,
"Selia"
,
"Selie"
,
"Selina"
,
"Selinda"
,
"Seline"
,
"Sella"
,
"Selle"
,
"Selma"
,
"Sena"
,
"Sephira"
,
"Serena"
,
"Serene"
,
"Shae"
,
"Shaina"
,
"Shaine"
,
"Shalna"
,
"Shalne"
,
"Shana"
,
"Shanda"
,
"Shandee"
,
"Shandeigh"
,
"Shandie"
,
"Shandra"
,
"Shandy"
,
"Shane"
,
"Shani"
,
"Shanie"
,
"Shanna"
,
"Shannah"
,
"Shannen"
,
"Shannon"
,
"Shanon"
,
"Shanta"
,
"Shantee"
,
"Shara"
,
"Sharai"
,
"Shari"
,
"Sharia"
,
"Sharity"
,
"Sharl"
,
"Sharla"
,
"Sharleen"
,
"Sharlene"
,
"Sharline"
,
"Sharon"
,
"Sharona"
,
"Sharron"
,
"Sharyl"
,
"Shaun"
,
"Shauna"
,
"Shawn"
,
"Shawna"
,
"Shawnee"
,
"Shay"
,
"Shayla"
,
"Shaylah"
,
"Shaylyn"
,
"Shaylynn"
,
"Shayna"
,
"Shayne"
,
"Shea"
,
"Sheba"
,
"Sheela"
,
"Sheelagh"
,
"Sheelah"
,
"Sheena"
,
"Sheeree"
,
"Sheila"
,
"Sheila-Kathryn"
,
"Sheilah"
,
"Shel"
,
"Shela"
,
"Shelagh"
,
"Shelba"
,
"Shelbi"
,
"Shelby"
,
"Shelia"
,
"Shell"
,
"Shelley"
,
"Shelli"
,
"Shellie"
,
"Shelly"
,
"Shena"
,
"Sher"
,
"Sheree"
,
"Sheri"
,
"Sherie"
,
"Sherill"
,
"Sherilyn"
,
"Sherline"
,
"Sherri"
,
"Sherrie"
,
"Sherry"
,
"Sherye"
,
"Sheryl"
,
"Shina"
,
"Shir"
,
"Shirl"
,
"Shirlee"
,
"Shirleen"
,
"Shirlene"
,
"Shirley"
,
"Shirline"
,
"Shoshana"
,
"Shoshanna"
,
"Siana"
,
"Sianna"
,
"Sib"
,
"Sibbie"
,
"Sibby"
,
"Sibeal"
,
"Sibel"
,
"Sibella"
,
"Sibelle"
,
"Sibilla"
,
"Sibley"
,
"Sibyl"
,
"Sibylla"
,
"Sibylle"
,
"Sidoney"
,
"Sidonia"
,
"Sidonnie"
,
"Sigrid"
,
"Sile"
,
"Sileas"
,
"Silva"
,
"Silvana"
,
"Silvia"
,
"Silvie"
,
"Simona"
,
"Simone"
,
"Simonette"
,
"Simonne"
,
"Sindee"
,
"Siobhan"
,
"Sioux"
,
"Siouxie"
,
"Sisely"
,
"Sisile"
,
"Sissie"
,
"Sissy"
,
"Siusan"
,
"Sofia"
,
"Sofie"
,
"Sondra"
,
"Sonia"
,
"Sonja"
,
"Sonni"
,
"Sonnie"
,
"Sonnnie"
,
"Sonny"
,
"Sonya"
,
"Sophey"
,
"Sophi"
,
"Sophia"
,
"Sophie"
,
"Sophronia"
,
"Sorcha"
,
"Sosanna"
,
"Stace"
,
"Stacee"
,
"Stacey"
,
"Staci"
,
"Stacia"
,
"Stacie"
,
"Stacy"
,
"Stafani"
,
"Star"
,
"Starla"
,
"Starlene"
,
"Starlin"
,
"Starr"
,
"Stefa"
,
"Stefania"
,
"Stefanie"
,
"Steffane"
,
"Steffi"
,
"Steffie"
,
"Stella"
,
"Stepha"
,
"Stephana"
,
"Stephani"
,
"Stephanie"
,
"Stephannie"
,
"Stephenie"
,
"Stephi"
,
"Stephie"
,
"Stephine"
,
"Stesha"
,
"Stevana"
,
"Stevena"
,
"Stoddard"
,
"Storm"
,
"Stormi"
,
"Stormie"
,
"Stormy"
,
"Sue"
,
"Suellen"
,
"Sukey"
,
"Suki"
,
"Sula"
,
"Sunny"
,
"Sunshine"
,
"Susan"
,
"Susana"
,
"Susanetta"
,
"Susann"
,
"Susanna"
,
"Susannah"
,
"Susanne"
,
"Susette"
,
"Susi"
,
"Susie"
,
"Susy"
,
"Suzann"
,
"Suzanna"
,
"Suzanne"
,
"Suzette"
,
"Suzi"
,
"Suzie"
,
"Suzy"
,
"Sybil"
,
"Sybila"
,
"Sybilla"
,
"Sybille"
,
"Sybyl"
,
"Sydel"
,
"Sydelle"
,
"Sydney"
,
"Sylvia"
,
"Tabatha"
,
"Tabbatha"
,
"Tabbi"
,
"Tabbie"
,
"Tabbitha"
,
"Tabby"
,
"Tabina"
,
"Tabitha"
,
"Taffy"
,
"Talia"
,
"Tallia"
,
"Tallie"
,
"Tallou"
,
"Tallulah"
,
"Tally"
,
"Talya"
,
"Talyah"
,
"Tamar"
,
"Tamara"
,
"Tamarah"
,
"Tamarra"
,
"Tamera"
,
"Tami"
,
"Tamiko"
,
"Tamma"
,
"Tammara"
,
"Tammi"
,
"Tammie"
,
"Tammy"
,
"Tamqrah"
,
"Tamra"
,
"Tana"
,
"Tandi"
,
"Tandie"
,
"Tandy"
,
"Tanhya"
,
"Tani"
,
"Tania"
,
"Tanitansy"
,
"Tansy"
,
"Tanya"
,
"Tara"
,
"Tarah"
,
"Tarra"
,
"Tarrah"
,
"Taryn"
,
"Tasha"
,
"Tasia"
,
"Tate"
,
"Tatiana"
,
"Tatiania"
,
"Tatum"
,
"Tawnya"
,
"Tawsha"
,
"Ted"
,
"Tedda"
,
"Teddi"
,
"Teddie"
,
"Teddy"
,
"Tedi"
,
"Tedra"
,
"Teena"
,
"TEirtza"
,
"Teodora"
,
"Tera"
,
"Teresa"
,
"Terese"
,
"Teresina"
,
"Teresita"
,
"Teressa"
,
"Teri"
,
"Teriann"
,
"Terra"
,
"Terri"
,
"Terrie"
,
"Terrijo"
,
"Terry"
,
"Terrye"
,
"Tersina"
,
"Terza"
,
"Tess"
,
"Tessa"
,
"Tessi"
,
"Tessie"
,
"Tessy"
,
"Thalia"
,
"Thea"
,
"Theadora"
,
"Theda"
,
"Thekla"
,
"Thelma"
,
"Theo"
,
"Theodora"
,
"Theodosia"
,
"Theresa"
,
"Therese"
,
"Theresina"
,
"Theresita"
,
"Theressa"
,
"Therine"
,
"Thia"
,
"Thomasa"
,
"Thomasin"
,
"Thomasina"
,
"Thomasine"
,
"Tiena"
,
"Tierney"
,
"Tiertza"
,
"Tiff"
,
"Tiffani"
,
"Tiffanie"
,
"Tiffany"
,
"Tiffi"
,
"Tiffie"
,
"Tiffy"
,
"Tilda"
,
"Tildi"
,
"Tildie"
,
"Tildy"
,
"Tillie"
,
"Tilly"
,
"Tim"
,
"Timi"
,
"Timmi"
,
"Timmie"
,
"Timmy"
,
"Timothea"
,
"Tina"
,
"Tine"
,
"Tiphani"
,
"Tiphanie"
,
"Tiphany"
,
"Tish"
,
"Tisha"
,
"Tobe"
,
"Tobey"
,
"Tobi"
,
"Toby"
,
"Tobye"
,
"Toinette"
,
"Toma"
,
"Tomasina"
,
"Tomasine"
,
"Tomi"
,
"Tommi"
,
"Tommie"
,
"Tommy"
,
"Toni"
,
"Tonia"
,
"Tonie"
,
"Tony"
,
"Tonya"
,
"Tonye"
,
"Tootsie"
,
"Torey"
,
"Tori"
,
"Torie"
,
"Torrie"
,
"Tory"
,
"Tova"
,
"Tove"
,
"Tracee"
,
"Tracey"
,
"Traci"
,
"Tracie"
,
"Tracy"
,
"Trenna"
,
"Tresa"
,
"Trescha"
,
"Tressa"
,
"Tricia"
,
"Trina"
,
"Trish"
,
"Trisha"
,
"Trista"
,
"Trix"
,
"Trixi"
,
"Trixie"
,
"Trixy"
,
"Truda"
,
"Trude"
,
"Trudey"
,
"Trudi"
,
"Trudie"
,
"Trudy"
,
"Trula"
,
"Tuesday"
,
"Twila"
,
"Twyla"
,
"Tybi"
,
"Tybie"
,
"Tyne"
,
"Ula"
,
"Ulla"
,
"Ulrica"
,
"Ulrika"
,
"Ulrikaumeko"
,
"Ulrike"
,
"Umeko"
,
"Una"
,
"Ursa"
,
"Ursala"
,
"Ursola"
,
"Ursula"
,
"Ursulina"
,
"Ursuline"
,
"Uta"
,
"Val"
,
"Valaree"
,
"Valaria"
,
"Vale"
,
"Valeda"
,
"Valencia"
,
"Valene"
,
"Valenka"
,
"Valentia"
,
"Valentina"
,
"Valentine"
,
"Valera"
,
"Valeria"
,
"Valerie"
,
"Valery"
,
"Valerye"
,
"Valida"
,
"Valina"
,
"Valli"
,
"Vallie"
,
"Vally"
,
"Valma"
,
"Valry"
,
"Van"
,
"Vanda"
,
"Vanessa"
,
"Vania"
,
"Vanna"
,
"Vanni"
,
"Vannie"
,
"Vanny"
,
"Vanya"
,
"Veda"
,
"Velma"
,
"Velvet"
,
"Venita"
,
"Venus"
,
"Vera"
,
"Veradis"
,
"Vere"
,
"Verena"
,
"Verene"
,
"Veriee"
,
"Verile"
,
"Verina"
,
"Verine"
,
"Verla"
,
"Verna"
,
"Vernice"
,
"Veronica"
,
"Veronika"
,
"Veronike"
,
"Veronique"
,
"Vevay"
,
"Vi"
,
"Vicki"
,
"Vickie"
,
"Vicky"
,
"Victoria"
,
"Vida"
,
"Viki"
,
"Vikki"
,
"Vikky"
,
"Vilhelmina"
,
"Vilma"
,
"Vin"
,
"Vina"
,
"Vinita"
,
"Vinni"
,
"Vinnie"
,
"Vinny"
,
"Viola"
,
"Violante"
,
"Viole"
,
"Violet"
,
"Violetta"
,
"Violette"
,
"Virgie"
,
"Virgina"
,
"Virginia"
,
"Virginie"
,
"Vita"
,
"Vitia"
,
"Vitoria"
,
"Vittoria"
,
"Viv"
,
"Viva"
,
"Vivi"
,
"Vivia"
,
"Vivian"
,
"Viviana"
,
"Vivianna"
,
"Vivianne"
,
"Vivie"
,
"Vivien"
,
"Viviene"
,
"Vivienne"
,
"Viviyan"
,
"Vivyan"
,
"Vivyanne"
,
"Vonni"
,
"Vonnie"
,
"Vonny"
,
"Vyky"
,
"Wallie"
,
"Wallis"
,
"Walliw"
,
"Wally"
,
"Waly"
,
"Wanda"
,
"Wandie"
,
"Wandis"
,
"Waneta"
,
"Wanids"
,
"Wenda"
,
"Wendeline"
,
"Wendi"
,
"Wendie"
,
"Wendy"
,
"Wendye"
,
"Wenona"
,
"Wenonah"
,
"Whitney"
,
"Wileen"
,
"Wilhelmina"
,
"Wilhelmine"
,
"Wilie"
,
"Willa"
,
"Willabella"
,
"Willamina"
,
"Willetta"
,
"Willette"
,
"Willi"
,
"Willie"
,
"Willow"
,
"Willy"
,
"Willyt"
,
"Wilma"
,
"Wilmette"
,
"Wilona"
,
"Wilone"
,
"Wilow"
,
"Windy"
,
"Wini"
,
"Winifred"
,
"Winna"
,
"Winnah"
,
"Winne"
,
"Winni"
,
"Winnie"
,
"Winnifred"
,
"Winny"
,
"Winona"
,
"Winonah"
,
"Wren"
,
"Wrennie"
,
"Wylma"
,
"Wynn"
,
"Wynne"
,
"Wynnie"
,
"Wynny"
,
"Xaviera"
,
"Xena"
,
"Xenia"
,
"Xylia"
,
"Xylina"
,
"Yalonda"
,
"Yasmeen"
,
"Yasmin"
,
"Yelena"
,
"Yetta"
,
"Yettie"
,
"Yetty"
,
"Yevette"
,
"Ynes"
,
"Ynez"
,
"Yoko"
,
"Yolanda"
,
"Yolande"
,
"Yolane"
,
"Yolanthe"
,
"Yoshi"
,
"Yoshiko"
,
"Yovonnda"
,
"Ysabel"
,
"Yvette"
,
"Yvonne"
,
"Zabrina"
,
"Zahara"
,
"Zandra"
,
"Zaneta"
,
"Zara"
,
"Zarah"
,
"Zaria"
,
"Zarla"
,
"Zea"
,
"Zelda"
,
"Zelma"
,
"Zena"
,
"Zenia"
,
"Zia"
,
"Zilvia"
,
"Zita"
,
"Zitella"
,
"Zoe"
,
"Zola"
,
"Zonda"
,
"Zondra"
,
"Zonnya"
,
"Zora"
,
"Zorah"
,
"Zorana"
,
"Zorina"
,
"Zorine"
,
"Zsa Zsa"
,
"Zsazsa"
,
"Zulema"
,
"Zuzana"
]

},{}],284:[function(require,module,exports){
(function (process){

var names = require('./names.json')
var first = require('./first-names.json')
var middle = require('./middle-names.json')
var place = require('./places.json')

function r(names) {
  return function () {
    return names[~~(Math.random()*names.length)]
  }
}

var random = module.exports = function () {
  return random.first() + ' ' +random.last()
}

random.first   = r(first)
random.last    = r(names)
random.middle  = r(middle)
random.place   = r(place)

if(!module.parent) {
  var l = process.argv[2] || 10
  while (l--)
    console.log(random.first(), '.', random.middle(), '.', random.last()
    , ',', random.place())
}
  

}).call(this,require('_process'))
},{"./first-names.json":283,"./middle-names.json":285,"./names.json":286,"./places.json":287,"_process":370}],285:[function(require,module,exports){
module.exports=[
"Aaron"
,
"Ab"
,
"Abba"
,
"Abbe"
,
"Abbey"
,
"Abbie"
,
"Abbot"
,
"Abbott"
,
"Abby"
,
"Abdel"
,
"Abdul"
,
"Abe"
,
"Abel"
,
"Abelard"
,
"Abeu"
,
"Abey"
,
"Abie"
,
"Abner"
,
"Abraham"
,
"Abrahan"
,
"Abram"
,
"Abramo"
,
"Abran"
,
"Ad"
,
"Adair"
,
"Adam"
,
"Adamo"
,
"Adams"
,
"Adan"
,
"Addie"
,
"Addison"
,
"Addy"
,
"Ade"
,
"Adelbert"
,
"Adham"
,
"Adlai"
,
"Adler"
,
"Ado"
,
"Adolf"
,
"Adolph"
,
"Adolphe"
,
"Adolpho"
,
"Adolphus"
,
"Adrian"
,
"Adriano"
,
"Adrien"
,
"Agosto"
,
"Aguie"
,
"Aguistin"
,
"Aguste"
,
"Agustin"
,
"Aharon"
,
"Ahmad"
,
"Ahmed"
,
"Ailbert"
,
"Akim"
,
"Aksel"
,
"Al"
,
"Alain"
,
"Alair"
,
"Alan"
,
"Aland"
,
"Alano"
,
"Alanson"
,
"Alard"
,
"Alaric"
,
"Alasdair"
,
"Alastair"
,
"Alasteir"
,
"Alaster"
,
"Alberik"
,
"Albert"
,
"Alberto"
,
"Albie"
,
"Albrecht"
,
"Alden"
,
"Aldin"
,
"Aldis"
,
"Aldo"
,
"Aldon"
,
"Aldous"
,
"Aldric"
,
"Aldrich"
,
"Aldridge"
,
"Aldus"
,
"Aldwin"
,
"Alec"
,
"Alejandro"
,
"Alejoa"
,
"Aleksandr"
,
"Alessandro"
,
"Alex"
,
"Alexander"
,
"Alexandr"
,
"Alexandre"
,
"Alexandro"
,
"Alexandros"
,
"Alexei"
,
"Alexio"
,
"Alexis"
,
"Alf"
,
"Alfie"
,
"Alfons"
,
"Alfonse"
,
"Alfonso"
,
"Alford"
,
"Alfred"
,
"Alfredo"
,
"Alfy"
,
"Algernon"
,
"Ali"
,
"Alic"
,
"Alick"
,
"Alisander"
,
"Alistair"
,
"Alister"
,
"Alix"
,
"Allan"
,
"Allard"
,
"Allayne"
,
"Allen"
,
"Alley"
,
"Alleyn"
,
"Allie"
,
"Allin"
,
"Allister"
,
"Allistir"
,
"Allyn"
,
"Aloin"
,
"Alon"
,
"Alonso"
,
"Alonzo"
,
"Aloysius"
,
"Alphard"
,
"Alphonse"
,
"Alphonso"
,
"Alric"
,
"Aluin"
,
"Aluino"
,
"Alva"
,
"Alvan"
,
"Alvie"
,
"Alvin"
,
"Alvis"
,
"Alvy"
,
"Alwin"
,
"Alwyn"
,
"Alyosha"
,
"Amble"
,
"Ambros"
,
"Ambrose"
,
"Ambrosi"
,
"Ambrosio"
,
"Ambrosius"
,
"Amby"
,
"Amerigo"
,
"Amery"
,
"Amory"
,
"Amos"
,
"Anatol"
,
"Anatole"
,
"Anatollo"
,
"Ancell"
,
"Anders"
,
"Anderson"
,
"Andie"
,
"Andonis"
,
"Andras"
,
"Andre"
,
"Andrea"
,
"Andreas"
,
"Andrej"
,
"Andres"
,
"Andrew"
,
"Andrey"
,
"Andris"
,
"Andros"
,
"Andrus"
,
"Andy"
,
"Ange"
,
"Angel"
,
"Angeli"
,
"Angelico"
,
"Angelo"
,
"Angie"
,
"Angus"
,
"Ansel"
,
"Ansell"
,
"Anselm"
,
"Anson"
,
"Anthony"
,
"Antin"
,
"Antoine"
,
"Anton"
,
"Antone"
,
"Antoni"
,
"Antonin"
,
"Antonino"
,
"Antonio"
,
"Antonius"
,
"Antons"
,
"Antony"
,
"Any"
,
"Ara"
,
"Araldo"
,
"Arch"
,
"Archaimbaud"
,
"Archambault"
,
"Archer"
,
"Archibald"
,
"Archibaldo"
,
"Archibold"
,
"Archie"
,
"Archy"
,
"Arel"
,
"Ari"
,
"Arie"
,
"Ariel"
,
"Arin"
,
"Ario"
,
"Aristotle"
,
"Arlan"
,
"Arlen"
,
"Arley"
,
"Arlin"
,
"Arman"
,
"Armand"
,
"Armando"
,
"Armin"
,
"Armstrong"
,
"Arnaldo"
,
"Arne"
,
"Arney"
,
"Arni"
,
"Arnie"
,
"Arnold"
,
"Arnoldo"
,
"Arnuad"
,
"Arny"
,
"Aron"
,
"Arri"
,
"Arron"
,
"Art"
,
"Artair"
,
"Arte"
,
"Artemas"
,
"Artemis"
,
"Artemus"
,
"Arther"
,
"Arthur"
,
"Artie"
,
"Artur"
,
"Arturo"
,
"Artus"
,
"Arty"
,
"Arv"
,
"Arvie"
,
"Arvin"
,
"Arvy"
,
"Asa"
,
"Ase"
,
"Ash"
,
"Ashbey"
,
"Ashby"
,
"Asher"
,
"Ashley"
,
"Ashlin"
,
"Ashton"
,
"Aube"
,
"Auberon"
,
"Aubert"
,
"Aubrey"
,
"Augie"
,
"August"
,
"Augustin"
,
"Augustine"
,
"Augusto"
,
"Augustus"
,
"Augy"
,
"Aurthur"
,
"Austen"
,
"Austin"
,
"Ave"
,
"Averell"
,
"Averil"
,
"Averill"
,
"Avery"
,
"Avictor"
,
"Avigdor"
,
"Avram"
,
"Avrom"
,
"Ax"
,
"Axe"
,
"Axel"
,
"Aylmar"
,
"Aylmer"
,
"Aymer"
,
"Bail"
,
"Bailey"
,
"Bailie"
,
"Baillie"
,
"Baily"
,
"Baird"
,
"Bald"
,
"Balduin"
,
"Baldwin"
,
"Bale"
,
"Ban"
,
"Bancroft"
,
"Bank"
,
"Banky"
,
"Bar"
,
"Barbabas"
,
"Barclay"
,
"Bard"
,
"Barde"
,
"Barn"
,
"Barnabas"
,
"Barnabe"
,
"Barnaby"
,
"Barnard"
,
"Barnebas"
,
"Barnett"
,
"Barney"
,
"Barnie"
,
"Barny"
,
"Baron"
,
"Barr"
,
"Barret"
,
"Barrett"
,
"Barri"
,
"Barrie"
,
"Barris"
,
"Barron"
,
"Barry"
,
"Bart"
,
"Bartel"
,
"Barth"
,
"Barthel"
,
"Bartholemy"
,
"Bartholomeo"
,
"Bartholomeus"
,
"Bartholomew"
,
"Bartie"
,
"Bartlet"
,
"Bartlett"
,
"Bartolemo"
,
"Bartolomeo"
,
"Barton"
,
"Bartram"
,
"Barty"
,
"Bary"
,
"Baryram"
,
"Base"
,
"Basil"
,
"Basile"
,
"Basilio"
,
"Basilius"
,
"Bastian"
,
"Bastien"
,
"Bat"
,
"Batholomew"
,
"Baudoin"
,
"Bax"
,
"Baxie"
,
"Baxter"
,
"Baxy"
,
"Bay"
,
"Bayard"
,
"Beale"
,
"Bealle"
,
"Bear"
,
"Bearnard"
,
"Beau"
,
"Beaufort"
,
"Beauregard"
,
"Beck"
,
"Beltran"
,
"Ben"
,
"Bendick"
,
"Bendicty"
,
"Bendix"
,
"Benedetto"
,
"Benedick"
,
"Benedict"
,
"Benedicto"
,
"Benedikt"
,
"Bengt"
,
"Beniamino"
,
"Benito"
,
"Benjamen"
,
"Benjamin"
,
"Benji"
,
"Benjie"
,
"Benjy"
,
"Benn"
,
"Bennett"
,
"Bennie"
,
"Benny"
,
"Benoit"
,
"Benson"
,
"Bent"
,
"Bentlee"
,
"Bentley"
,
"Benton"
,
"Benyamin"
,
"Ber"
,
"Berk"
,
"Berke"
,
"Berkeley"
,
"Berkie"
,
"Berkley"
,
"Berkly"
,
"Berky"
,
"Bern"
,
"Bernard"
,
"Bernardo"
,
"Bernarr"
,
"Berne"
,
"Bernhard"
,
"Bernie"
,
"Berny"
,
"Bert"
,
"Berti"
,
"Bertie"
,
"Berton"
,
"Bertram"
,
"Bertrand"
,
"Bertrando"
,
"Berty"
,
"Bev"
,
"Bevan"
,
"Bevin"
,
"Bevon"
,
"Bil"
,
"Bill"
,
"Billie"
,
"Billy"
,
"Bing"
,
"Bink"
,
"Binky"
,
"Birch"
,
"Birk"
,
"Biron"
,
"Bjorn"
,
"Blaine"
,
"Blair"
,
"Blake"
,
"Blane"
,
"Blayne"
,
"Bo"
,
"Bob"
,
"Bobbie"
,
"Bobby"
,
"Bogart"
,
"Bogey"
,
"Boigie"
,
"Bond"
,
"Bondie"
,
"Bondon"
,
"Bondy"
,
"Bone"
,
"Boniface"
,
"Boone"
,
"Boonie"
,
"Boony"
,
"Boot"
,
"Boote"
,
"Booth"
,
"Boothe"
,
"Bord"
,
"Borden"
,
"Bordie"
,
"Bordy"
,
"Borg"
,
"Boris"
,
"Bourke"
,
"Bowie"
,
"Boy"
,
"Boyce"
,
"Boycey"
,
"Boycie"
,
"Boyd"
,
"Brad"
,
"Bradan"
,
"Brade"
,
"Braden"
,
"Bradford"
,
"Bradley"
,
"Bradly"
,
"Bradney"
,
"Brady"
,
"Bram"
,
"Bran"
,
"Brand"
,
"Branden"
,
"Brander"
,
"Brandon"
,
"Brandtr"
,
"Brandy"
,
"Brandyn"
,
"Brannon"
,
"Brant"
,
"Brantley"
,
"Bren"
,
"Brendan"
,
"Brenden"
,
"Brendin"
,
"Brendis"
,
"Brendon"
,
"Brennan"
,
"Brennen"
,
"Brent"
,
"Bret"
,
"Brett"
,
"Brew"
,
"Brewer"
,
"Brewster"
,
"Brian"
,
"Briano"
,
"Briant"
,
"Brice"
,
"Brien"
,
"Brig"
,
"Brigg"
,
"Briggs"
,
"Brigham"
,
"Brion"
,
"Brit"
,
"Britt"
,
"Brnaba"
,
"Brnaby"
,
"Brock"
,
"Brockie"
,
"Brocky"
,
"Brod"
,
"Broddie"
,
"Broddy"
,
"Broderic"
,
"Broderick"
,
"Brodie"
,
"Brody"
,
"Brok"
,
"Bron"
,
"Bronnie"
,
"Bronny"
,
"Bronson"
,
"Brook"
,
"Brooke"
,
"Brooks"
,
"Brose"
,
"Bruce"
,
"Brucie"
,
"Bruis"
,
"Bruno"
,
"Bryan"
,
"Bryant"
,
"Bryanty"
,
"Bryce"
,
"Bryn"
,
"Bryon"
,
"Buck"
,
"Buckie"
,
"Bucky"
,
"Bud"
,
"Budd"
,
"Buddie"
,
"Buddy"
,
"Buiron"
,
"Burch"
,
"Burg"
,
"Burgess"
,
"Burk"
,
"Burke"
,
"Burl"
,
"Burlie"
,
"Burnaby"
,
"Burnard"
,
"Burr"
,
"Burt"
,
"Burtie"
,
"Burton"
,
"Burty"
,
"Butch"
,
"Byram"
,
"Byran"
,
"Byrann"
,
"Byrle"
,
"Byrom"
,
"Byron"
,
"Cad"
,
"Caddric"
,
"Caesar"
,
"Cal"
,
"Caldwell"
,
"Cale"
,
"Caleb"
,
"Calhoun"
,
"Callean"
,
"Calv"
,
"Calvin"
,
"Cam"
,
"Cameron"
,
"Camey"
,
"Cammy"
,
"Car"
,
"Carce"
,
"Care"
,
"Carey"
,
"Carl"
,
"Carleton"
,
"Carlie"
,
"Carlin"
,
"Carling"
,
"Carlo"
,
"Carlos"
,
"Carly"
,
"Carlyle"
,
"Carmine"
,
"Carney"
,
"Carny"
,
"Carolus"
,
"Carr"
,
"Carrol"
,
"Carroll"
,
"Carson"
,
"Cart"
,
"Carter"
,
"Carver"
,
"Cary"
,
"Caryl"
,
"Casar"
,
"Case"
,
"Casey"
,
"Cash"
,
"Caspar"
,
"Casper"
,
"Cass"
,
"Cassie"
,
"Cassius"
,
"Caz"
,
"Cazzie"
,
"Cchaddie"
,
"Cece"
,
"Cecil"
,
"Cecilio"
,
"Cecilius"
,
"Ced"
,
"Cedric"
,
"Cello"
,
"Cesar"
,
"Cesare"
,
"Cesaro"
,
"Chad"
,
"Chadd"
,
"Chaddie"
,
"Chaddy"
,
"Chadwick"
,
"Chaim"
,
"Chalmers"
,
"Chan"
,
"Chance"
,
"Chancey"
,
"Chandler"
,
"Chane"
,
"Chariot"
,
"Charles"
,
"Charley"
,
"Charlie"
,
"Charlton"
,
"Chas"
,
"Chase"
,
"Chaunce"
,
"Chauncey"
,
"Che"
,
"Chen"
,
"Ches"
,
"Chester"
,
"Cheston"
,
"Chet"
,
"Chev"
,
"Chevalier"
,
"Chevy"
,
"Chic"
,
"Chick"
,
"Chickie"
,
"Chicky"
,
"Chico"
,
"Chilton"
,
"Chip"
,
"Chris"
,
"Chrisse"
,
"Chrissie"
,
"Chrissy"
,
"Christian"
,
"Christiano"
,
"Christie"
,
"Christoffer"
,
"Christoforo"
,
"Christoper"
,
"Christoph"
,
"Christophe"
,
"Christopher"
,
"Christophorus"
,
"Christos"
,
"Christy"
,
"Chrisy"
,
"Chrotoem"
,
"Chucho"
,
"Chuck"
,
"Cirillo"
,
"Cirilo"
,
"Ciro"
,
"Claiborn"
,
"Claiborne"
,
"Clair"
,
"Claire"
,
"Clarance"
,
"Clare"
,
"Clarence"
,
"Clark"
,
"Clarke"
,
"Claudell"
,
"Claudian"
,
"Claudianus"
,
"Claudio"
,
"Claudius"
,
"Claus"
,
"Clay"
,
"Clayborn"
,
"Clayborne"
,
"Claybourne"
,
"Clayson"
,
"Clayton"
,
"Cleavland"
,
"Clem"
,
"Clemens"
,
"Clement"
,
"Clemente"
,
"Clementius"
,
"Clemmie"
,
"Clemmy"
,
"Cleon"
,
"Clerc"
,
"Cletis"
,
"Cletus"
,
"Cleve"
,
"Cleveland"
,
"Clevey"
,
"Clevie"
,
"Cliff"
,
"Clifford"
,
"Clim"
,
"Clint"
,
"Clive"
,
"Cly"
,
"Clyde"
,
"Clyve"
,
"Clywd"
,
"Cob"
,
"Cobb"
,
"Cobbie"
,
"Cobby"
,
"Codi"
,
"Codie"
,
"Cody"
,
"Cointon"
,
"Colan"
,
"Colas"
,
"Colby"
,
"Cole"
,
"Coleman"
,
"Colet"
,
"Colin"
,
"Collin"
,
"Colman"
,
"Colver"
,
"Con"
,
"Conan"
,
"Conant"
,
"Conn"
,
"Conney"
,
"Connie"
,
"Connor"
,
"Conny"
,
"Conrad"
,
"Conrade"
,
"Conrado"
,
"Conroy"
,
"Consalve"
,
"Constantin"
,
"Constantine"
,
"Constantino"
,
"Conway"
,
"Coop"
,
"Cooper"
,
"Corbet"
,
"Corbett"
,
"Corbie"
,
"Corbin"
,
"Corby"
,
"Cord"
,
"Cordell"
,
"Cordie"
,
"Cordy"
,
"Corey"
,
"Cori"
,
"Cornall"
,
"Cornelius"
,
"Cornell"
,
"Corney"
,
"Cornie"
,
"Corny"
,
"Correy"
,
"Corrie"
,
"Cort"
,
"Cortie"
,
"Corty"
,
"Cory"
,
"Cos"
,
"Cosimo"
,
"Cosme"
,
"Cosmo"
,
"Costa"
,
"Court"
,
"Courtnay"
,
"Courtney"
,
"Cozmo"
,
"Craggie"
,
"Craggy"
,
"Craig"
,
"Crawford"
,
"Creigh"
,
"Creight"
,
"Creighton"
,
"Crichton"
,
"Cris"
,
"Cristian"
,
"Cristiano"
,
"Cristobal"
,
"Crosby"
,
"Cross"
,
"Cull"
,
"Cullan"
,
"Cullen"
,
"Culley"
,
"Cullie"
,
"Cullin"
,
"Cully"
,
"Culver"
,
"Curcio"
,
"Curr"
,
"Curran"
,
"Currey"
,
"Currie"
,
"Curry"
,
"Curt"
,
"Curtice"
,
"Curtis"
,
"Cy"
,
"Cyril"
,
"Cyrill"
,
"Cyrille"
,
"Cyrillus"
,
"Cyrus"
,
"D'Arcy"
,
"Dael"
,
"Dag"
,
"Dagny"
,
"Dal"
,
"Dale"
,
"Dalis"
,
"Dall"
,
"Dallas"
,
"Dalli"
,
"Dallis"
,
"Dallon"
,
"Dalston"
,
"Dalt"
,
"Dalton"
,
"Dame"
,
"Damian"
,
"Damiano"
,
"Damien"
,
"Damon"
,
"Dan"
,
"Dana"
,
"Dane"
,
"Dani"
,
"Danie"
,
"Daniel"
,
"Dannel"
,
"Dannie"
,
"Danny"
,
"Dante"
,
"Danya"
,
"Dar"
,
"Darb"
,
"Darbee"
,
"Darby"
,
"Darcy"
,
"Dare"
,
"Daren"
,
"Darill"
,
"Darin"
,
"Dario"
,
"Darius"
,
"Darn"
,
"Darnall"
,
"Darnell"
,
"Daron"
,
"Darrel"
,
"Darrell"
,
"Darren"
,
"Darrick"
,
"Darrin"
,
"Darryl"
,
"Darwin"
,
"Daryl"
,
"Daryle"
,
"Dav"
,
"Dave"
,
"Daven"
,
"Davey"
,
"David"
,
"Davidde"
,
"Davide"
,
"Davidson"
,
"Davie"
,
"Davin"
,
"Davis"
,
"Davon"
,
"Davy"
,
"De Witt"
,
"Dean"
,
"Deane"
,
"Decca"
,
"Deck"
,
"Del"
,
"Delainey"
,
"Delaney"
,
"Delano"
,
"Delbert"
,
"Dell"
,
"Delmar"
,
"Delmer"
,
"Delmor"
,
"Delmore"
,
"Demetre"
,
"Demetri"
,
"Demetris"
,
"Demetrius"
,
"Demott"
,
"Den"
,
"Dene"
,
"Denis"
,
"Dennet"
,
"Denney"
,
"Dennie"
,
"Dennis"
,
"Dennison"
,
"Denny"
,
"Denver"
,
"Denys"
,
"Der"
,
"Derby"
,
"Derek"
,
"Derick"
,
"Derk"
,
"Dermot"
,
"Derrek"
,
"Derrick"
,
"Derrik"
,
"Derril"
,
"Derron"
,
"Derry"
,
"Derward"
,
"Derwin"
,
"Des"
,
"Desi"
,
"Desmond"
,
"Desmund"
,
"Dev"
,
"Devin"
,
"Devland"
,
"Devlen"
,
"Devlin"
,
"Devy"
,
"Dew"
,
"Dewain"
,
"Dewey"
,
"Dewie"
,
"Dewitt"
,
"Dex"
,
"Dexter"
,
"Diarmid"
,
"Dick"
,
"Dickie"
,
"Dicky"
,
"Diego"
,
"Dieter"
,
"Dietrich"
,
"Dilan"
,
"Dill"
,
"Dillie"
,
"Dillon"
,
"Dilly"
,
"Dimitri"
,
"Dimitry"
,
"Dino"
,
"Dion"
,
"Dionisio"
,
"Dionysus"
,
"Dirk"
,
"Dmitri"
,
"Dolf"
,
"Dolph"
,
"Dom"
,
"Domenic"
,
"Domenico"
,
"Domingo"
,
"Dominic"
,
"Dominick"
,
"Dominik"
,
"Dominique"
,
"Don"
,
"Donal"
,
"Donall"
,
"Donalt"
,
"Donaugh"
,
"Donavon"
,
"Donn"
,
"Donnell"
,
"Donnie"
,
"Donny"
,
"Donovan"
,
"Dore"
,
"Dorey"
,
"Dorian"
,
"Dorie"
,
"Dory"
,
"Doug"
,
"Dougie"
,
"Douglas"
,
"Douglass"
,
"Dougy"
,
"Dov"
,
"Doy"
,
"Doyle"
,
"Drake"
,
"Drew"
,
"Dru"
,
"Drud"
,
"Drugi"
,
"Duane"
,
"Dud"
,
"Dudley"
,
"Duff"
,
"Duffie"
,
"Duffy"
,
"Dugald"
,
"Duke"
,
"Dukey"
,
"Dukie"
,
"Duky"
,
"Dun"
,
"Dunc"
,
"Duncan"
,
"Dunn"
,
"Dunstan"
,
"Dur"
,
"Durand"
,
"Durant"
,
"Durante"
,
"Durward"
,
"Dwain"
,
"Dwayne"
,
"Dwight"
,
"Dylan"
,
"Eadmund"
,
"Eal"
,
"Eamon"
,
"Earl"
,
"Earle"
,
"Earlie"
,
"Early"
,
"Earvin"
,
"Eb"
,
"Eben"
,
"Ebeneser"
,
"Ebenezer"
,
"Eberhard"
,
"Eberto"
,
"Ed"
,
"Edan"
,
"Edd"
,
"Eddie"
,
"Eddy"
,
"Edgar"
,
"Edgard"
,
"Edgardo"
,
"Edik"
,
"Edlin"
,
"Edmon"
,
"Edmund"
,
"Edouard"
,
"Edsel"
,
"Eduard"
,
"Eduardo"
,
"Eduino"
,
"Edvard"
,
"Edward"
,
"Edwin"
,
"Efrem"
,
"Efren"
,
"Egan"
,
"Egbert"
,
"Egon"
,
"Egor"
,
"El"
,
"Elbert"
,
"Elden"
,
"Eldin"
,
"Eldon"
,
"Eldredge"
,
"Eldridge"
,
"Eli"
,
"Elia"
,
"Elias"
,
"Elihu"
,
"Elijah"
,
"Eliot"
,
"Elisha"
,
"Ellary"
,
"Ellerey"
,
"Ellery"
,
"Elliot"
,
"Elliott"
,
"Ellis"
,
"Ellswerth"
,
"Ellsworth"
,
"Ellwood"
,
"Elmer"
,
"Elmo"
,
"Elmore"
,
"Elnar"
,
"Elroy"
,
"Elston"
,
"Elsworth"
,
"Elton"
,
"Elvin"
,
"Elvis"
,
"Elvyn"
,
"Elwin"
,
"Elwood"
,
"Elwyn"
,
"Ely"
,
"Em"
,
"Emanuel"
,
"Emanuele"
,
"Emelen"
,
"Emerson"
,
"Emery"
,
"Emile"
,
"Emilio"
,
"Emlen"
,
"Emlyn"
,
"Emmanuel"
,
"Emmerich"
,
"Emmery"
,
"Emmet"
,
"Emmett"
,
"Emmit"
,
"Emmott"
,
"Emmy"
,
"Emory"
,
"Engelbert"
,
"Englebert"
,
"Ennis"
,
"Enoch"
,
"Enos"
,
"Enrico"
,
"Enrique"
,
"Ephraim"
,
"Ephrayim"
,
"Ephrem"
,
"Erasmus"
,
"Erastus"
,
"Erek"
,
"Erhard"
,
"Erhart"
,
"Eric"
,
"Erich"
,
"Erick"
,
"Erie"
,
"Erik"
,
"Erin"
,
"Erl"
,
"Ermanno"
,
"Ermin"
,
"Ernest"
,
"Ernesto"
,
"Ernestus"
,
"Ernie"
,
"Ernst"
,
"Erny"
,
"Errick"
,
"Errol"
,
"Erroll"
,
"Erskine"
,
"Erv"
,
"ErvIn"
,
"Erwin"
,
"Esdras"
,
"Esme"
,
"Esra"
,
"Esteban"
,
"Estevan"
,
"Etan"
,
"Ethan"
,
"Ethe"
,
"Ethelbert"
,
"Ethelred"
,
"Etienne"
,
"Ettore"
,
"Euell"
,
"Eugen"
,
"Eugene"
,
"Eugenio"
,
"Eugenius"
,
"Eustace"
,
"Ev"
,
"Evan"
,
"Evelin"
,
"Evelyn"
,
"Even"
,
"Everard"
,
"Evered"
,
"Everett"
,
"Evin"
,
"Evyn"
,
"Ewan"
,
"Eward"
,
"Ewart"
,
"Ewell"
,
"Ewen"
,
"Ezechiel"
,
"Ezekiel"
,
"Ezequiel"
,
"Eziechiele"
,
"Ezra"
,
"Ezri"
,
"Fabe"
,
"Faber"
,
"Fabian"
,
"Fabiano"
,
"Fabien"
,
"Fabio"
,
"Fair"
,
"Fairfax"
,
"Fairleigh"
,
"Fairlie"
,
"Falito"
,
"Falkner"
,
"Far"
,
"Farlay"
,
"Farlee"
,
"Farleigh"
,
"Farley"
,
"Farlie"
,
"Farly"
,
"Farr"
,
"Farrel"
,
"Farrell"
,
"Farris"
,
"Faulkner"
,
"Fax"
,
"Federico"
,
"Fee"
,
"Felic"
,
"Felice"
,
"Felicio"
,
"Felike"
,
"Feliks"
,
"Felipe"
,
"Felix"
,
"Felizio"
,
"Feodor"
,
"Ferd"
,
"Ferdie"
,
"Ferdinand"
,
"Ferdy"
,
"Fergus"
,
"Ferguson"
,
"Fernando"
,
"Ferrel"
,
"Ferrell"
,
"Ferris"
,
"Fidel"
,
"Fidelio"
,
"Fidole"
,
"Field"
,
"Fielding"
,
"Fields"
,
"Filbert"
,
"Filberte"
,
"Filberto"
,
"Filip"
,
"Filippo"
,
"Filmer"
,
"Filmore"
,
"Fin"
,
"Findlay"
,
"Findley"
,
"Finlay"
,
"Finley"
,
"Finn"
,
"Fitz"
,
"Fitzgerald"
,
"Flem"
,
"Fleming"
,
"Flemming"
,
"Fletch"
,
"Fletcher"
,
"Flin"
,
"Flinn"
,
"Flint"
,
"Florian"
,
"Flory"
,
"Floyd"
,
"Flynn"
,
"Fons"
,
"Fonsie"
,
"Fonz"
,
"Fonzie"
,
"Forbes"
,
"Ford"
,
"Forest"
,
"Forester"
,
"Forrest"
,
"Forrester"
,
"Forster"
,
"Foss"
,
"Foster"
,
"Fowler"
,
"Fran"
,
"Francesco"
,
"Franchot"
,
"Francis"
,
"Francisco"
,
"Franciskus"
,
"Francklin"
,
"Francklyn"
,
"Francois"
,
"Frank"
,
"Frankie"
,
"Franklin"
,
"Franklyn"
,
"Franky"
,
"Frannie"
,
"Franny"
,
"Frans"
,
"Fransisco"
,
"Frants"
,
"Franz"
,
"Franzen"
,
"Frasco"
,
"Fraser"
,
"Frasier"
,
"Frasquito"
,
"Fraze"
,
"Frazer"
,
"Frazier"
,
"Fred"
,
"Freddie"
,
"Freddy"
,
"Fredek"
,
"Frederic"
,
"Frederich"
,
"Frederick"
,
"Frederico"
,
"Frederigo"
,
"Frederik"
,
"Fredric"
,
"Fredrick"
,
"Free"
,
"Freedman"
,
"Freeland"
,
"Freeman"
,
"Freemon"
,
"Fremont"
,
"Friedrich"
,
"Friedrick"
,
"Fritz"
,
"Fulton"
,
"Gabbie"
,
"Gabby"
,
"Gabe"
,
"Gabi"
,
"Gabie"
,
"Gabriel"
,
"Gabriele"
,
"Gabriello"
,
"Gaby"
,
"Gael"
,
"Gaelan"
,
"Gage"
,
"Gail"
,
"Gaile"
,
"Gal"
,
"Gale"
,
"Galen"
,
"Gallagher"
,
"Gallard"
,
"Galvan"
,
"Galven"
,
"Galvin"
,
"Gamaliel"
,
"Gan"
,
"Gannie"
,
"Gannon"
,
"Ganny"
,
"Gar"
,
"Garald"
,
"Gard"
,
"Gardener"
,
"Gardie"
,
"Gardiner"
,
"Gardner"
,
"Gardy"
,
"Gare"
,
"Garek"
,
"Gareth"
,
"Garey"
,
"Garfield"
,
"Garik"
,
"Garner"
,
"Garold"
,
"Garrard"
,
"Garrek"
,
"Garret"
,
"Garreth"
,
"Garrett"
,
"Garrick"
,
"Garrik"
,
"Garrot"
,
"Garrott"
,
"Garry"
,
"Garth"
,
"Garv"
,
"Garvey"
,
"Garvin"
,
"Garvy"
,
"Garwin"
,
"Garwood"
,
"Gary"
,
"Gaspar"
,
"Gaspard"
,
"Gasparo"
,
"Gasper"
,
"Gaston"
,
"Gaultiero"
,
"Gauthier"
,
"Gav"
,
"Gavan"
,
"Gaven"
,
"Gavin"
,
"Gawain"
,
"Gawen"
,
"Gay"
,
"Gayelord"
,
"Gayle"
,
"Gayler"
,
"Gaylor"
,
"Gaylord"
,
"Gearalt"
,
"Gearard"
,
"Gene"
,
"Geno"
,
"Geoff"
,
"Geoffrey"
,
"Geoffry"
,
"Georas"
,
"Geordie"
,
"Georg"
,
"George"
,
"Georges"
,
"Georgi"
,
"Georgie"
,
"Georgy"
,
"Gerald"
,
"Gerard"
,
"Gerardo"
,
"Gerek"
,
"Gerhard"
,
"Gerhardt"
,
"Geri"
,
"Gerick"
,
"Gerik"
,
"Germain"
,
"Germaine"
,
"Germayne"
,
"Gerome"
,
"Gerrard"
,
"Gerri"
,
"Gerrie"
,
"Gerry"
,
"Gery"
,
"Gherardo"
,
"Giacobo"
,
"Giacomo"
,
"Giacopo"
,
"Gian"
,
"Gianni"
,
"Giavani"
,
"Gib"
,
"Gibb"
,
"Gibbie"
,
"Gibby"
,
"Gideon"
,
"Giff"
,
"Giffard"
,
"Giffer"
,
"Giffie"
,
"Gifford"
,
"Giffy"
,
"Gil"
,
"Gilbert"
,
"Gilberto"
,
"Gilburt"
,
"Giles"
,
"Gill"
,
"Gilles"
,
"Ginger"
,
"Gino"
,
"Giordano"
,
"Giorgi"
,
"Giorgio"
,
"Giovanni"
,
"Giraldo"
,
"Giraud"
,
"Giselbert"
,
"Giulio"
,
"Giuseppe"
,
"Giustino"
,
"Giusto"
,
"Glen"
,
"Glenden"
,
"Glendon"
,
"Glenn"
,
"Glyn"
,
"Glynn"
,
"Godard"
,
"Godart"
,
"Goddard"
,
"Goddart"
,
"Godfree"
,
"Godfrey"
,
"Godfry"
,
"Godwin"
,
"Gonzales"
,
"Gonzalo"
,
"Goober"
,
"Goran"
,
"Goraud"
,
"Gordan"
,
"Gorden"
,
"Gordie"
,
"Gordon"
,
"Gordy"
,
"Gothart"
,
"Gottfried"
,
"Grace"
,
"Gradeigh"
,
"Gradey"
,
"Grady"
,
"Graehme"
,
"Graeme"
,
"Graham"
,
"Graig"
,
"Gram"
,
"Gran"
,
"Grange"
,
"Granger"
,
"Grannie"
,
"Granny"
,
"Grant"
,
"Grantham"
,
"Granthem"
,
"Grantley"
,
"Granville"
,
"Gray"
,
"Greg"
,
"Gregg"
,
"Greggory"
,
"Gregoire"
,
"Gregoor"
,
"Gregor"
,
"Gregorio"
,
"Gregorius"
,
"Gregory"
,
"Grenville"
,
"Griff"
,
"Griffie"
,
"Griffin"
,
"Griffith"
,
"Griffy"
,
"Gris"
,
"Griswold"
,
"Griz"
,
"Grove"
,
"Grover"
,
"Gualterio"
,
"Guglielmo"
,
"Guido"
,
"Guilbert"
,
"Guillaume"
,
"Guillermo"
,
"Gun"
,
"Gunar"
,
"Gunner"
,
"Guntar"
,
"Gunter"
,
"Gunther"
,
"Gus"
,
"Guss"
,
"Gustaf"
,
"Gustav"
,
"Gustave"
,
"Gustavo"
,
"Gustavus"
,
"Guthrey"
,
"Guthrie"
,
"Guthry"
,
"Guy"
,
"Had"
,
"Hadlee"
,
"Hadleigh"
,
"Hadley"
,
"Hadrian"
,
"Hagan"
,
"Hagen"
,
"Hailey"
,
"Haily"
,
"Hakeem"
,
"Hakim"
,
"Hal"
,
"Hale"
,
"Haleigh"
,
"Haley"
,
"Hall"
,
"Hallsy"
,
"Halsey"
,
"Halsy"
,
"Ham"
,
"Hamel"
,
"Hamid"
,
"Hamil"
,
"Hamilton"
,
"Hamish"
,
"Hamlen"
,
"Hamlin"
,
"Hammad"
,
"Hamnet"
,
"Hanan"
,
"Hank"
,
"Hans"
,
"Hansiain"
,
"Hanson"
,
"Harald"
,
"Harbert"
,
"Harcourt"
,
"Hardy"
,
"Harlan"
,
"Harland"
,
"Harlen"
,
"Harley"
,
"Harlin"
,
"Harman"
,
"Harmon"
,
"Harold"
,
"Haroun"
,
"Harp"
,
"Harper"
,
"Harris"
,
"Harrison"
,
"Harry"
,
"Hart"
,
"Hartley"
,
"Hartwell"
,
"Harv"
,
"Harvey"
,
"Harwell"
,
"Harwilll"
,
"Hasheem"
,
"Hashim"
,
"Haskel"
,
"Haskell"
,
"Haslett"
,
"Hastie"
,
"Hastings"
,
"Hasty"
,
"Haven"
,
"Hayden"
,
"Haydon"
,
"Hayes"
,
"Hayward"
,
"Haywood"
,
"Hayyim"
,
"Haze"
,
"Hazel"
,
"Hazlett"
,
"Heall"
,
"Heath"
,
"Hebert"
,
"Hector"
,
"Heindrick"
,
"Heinrick"
,
"Heinrik"
,
"Henderson"
,
"Hendrick"
,
"Hendrik"
,
"Henri"
,
"Henrik"
,
"Henry"
,
"Herb"
,
"Herbert"
,
"Herbie"
,
"Herby"
,
"Herc"
,
"Hercule"
,
"Hercules"
,
"Herculie"
,
"Heriberto"
,
"Herman"
,
"Hermann"
,
"Hermie"
,
"Hermon"
,
"Hermy"
,
"Hernando"
,
"Herold"
,
"Herrick"
,
"Hersch"
,
"Herschel"
,
"Hersh"
,
"Hershel"
,
"Herve"
,
"Hervey"
,
"Hew"
,
"Hewe"
,
"Hewet"
,
"Hewett"
,
"Hewie"
,
"Hewitt"
,
"Heywood"
,
"Hi"
,
"Hieronymus"
,
"Hilario"
,
"Hilarius"
,
"Hilary"
,
"Hill"
,
"Hillard"
,
"Hillary"
,
"Hillel"
,
"Hillery"
,
"Hilliard"
,
"Hillie"
,
"Hillier"
,
"Hilly"
,
"Hillyer"
,
"Hilton"
,
"Hinze"
,
"Hiram"
,
"Hirsch"
,
"Hobard"
,
"Hobart"
,
"Hobey"
,
"Hobie"
,
"Hodge"
,
"Hoebart"
,
"Hogan"
,
"Holden"
,
"Hollis"
,
"Holly"
,
"Holmes"
,
"Holt"
,
"Homer"
,
"Homere"
,
"Homerus"
,
"Horace"
,
"Horacio"
,
"Horatio"
,
"Horatius"
,
"Horst"
,
"Hort"
,
"Horten"
,
"Horton"
,
"Howard"
,
"Howey"
,
"Howie"
,
"Hoyt"
,
"Hube"
,
"Hubert"
,
"Huberto"
,
"Hubey"
,
"Hubie"
,
"Huey"
,
"Hugh"
,
"Hughie"
,
"Hugibert"
,
"Hugo"
,
"Hugues"
,
"Humbert"
,
"Humberto"
,
"Humfrey"
,
"Humfrid"
,
"Humfried"
,
"Humphrey"
,
"Hunfredo"
,
"Hunt"
,
"Hunter"
,
"Huntington"
,
"Huntlee"
,
"Huntley"
,
"Hurlee"
,
"Hurleigh"
,
"Hurley"
,
"Husain"
,
"Husein"
,
"Hussein"
,
"Hy"
,
"Hyatt"
,
"Hyman"
,
"Hymie"
,
"Iago"
,
"Iain"
,
"Ian"
,
"Ibrahim"
,
"Ichabod"
,
"Iggie"
,
"Iggy"
,
"Ignace"
,
"Ignacio"
,
"Ignacius"
,
"Ignatius"
,
"Ignaz"
,
"Ignazio"
,
"Igor"
,
"Ike"
,
"Ikey"
,
"Ilaire"
,
"Ilario"
,
"Immanuel"
,
"Ingamar"
,
"Ingar"
,
"Ingelbert"
,
"Ingemar"
,
"Inger"
,
"Inglebert"
,
"Inglis"
,
"Ingmar"
,
"Ingra"
,
"Ingram"
,
"Ingrim"
,
"Inigo"
,
"Inness"
,
"Innis"
,
"Iorgo"
,
"Iorgos"
,
"Iosep"
,
"Ira"
,
"Irv"
,
"Irvin"
,
"Irvine"
,
"Irving"
,
"Irwin"
,
"Irwinn"
,
"Isa"
,
"Isaac"
,
"Isaak"
,
"Isac"
,
"Isacco"
,
"Isador"
,
"Isadore"
,
"Isaiah"
,
"Isak"
,
"Isiahi"
,
"Isidor"
,
"Isidore"
,
"Isidoro"
,
"Isidro"
,
"Israel"
,
"Issiah"
,
"Itch"
,
"Ivan"
,
"Ivar"
,
"Ive"
,
"Iver"
,
"Ives"
,
"Ivor"
,
"Izaak"
,
"Izak"
,
"Izzy"
,
"Jabez"
,
"Jack"
,
"Jackie"
,
"Jackson"
,
"Jacky"
,
"Jacob"
,
"Jacobo"
,
"Jacques"
,
"Jae"
,
"Jaime"
,
"Jaimie"
,
"Jake"
,
"Jakie"
,
"Jakob"
,
"Jamaal"
,
"Jamal"
,
"James"
,
"Jameson"
,
"Jamesy"
,
"Jamey"
,
"Jamie"
,
"Jamil"
,
"Jamill"
,
"Jamison"
,
"Jammal"
,
"Jan"
,
"Janek"
,
"Janos"
,
"Jarad"
,
"Jard"
,
"Jareb"
,
"Jared"
,
"Jarib"
,
"Jarid"
,
"Jarrad"
,
"Jarred"
,
"Jarret"
,
"Jarrett"
,
"Jarrid"
,
"Jarrod"
,
"Jarvis"
,
"Jase"
,
"Jasen"
,
"Jason"
,
"Jasper"
,
"Jasun"
,
"Javier"
,
"Jay"
,
"Jaye"
,
"Jayme"
,
"Jaymie"
,
"Jayson"
,
"Jdavie"
,
"Jean"
,
"Jecho"
,
"Jed"
,
"Jedd"
,
"Jeddy"
,
"Jedediah"
,
"Jedidiah"
,
"Jeff"
,
"Jefferey"
,
"Jefferson"
,
"Jeffie"
,
"Jeffrey"
,
"Jeffry"
,
"Jeffy"
,
"Jehu"
,
"Jeno"
,
"Jens"
,
"Jephthah"
,
"Jerad"
,
"Jerald"
,
"Jeramey"
,
"Jeramie"
,
"Jere"
,
"Jereme"
,
"Jeremiah"
,
"Jeremias"
,
"Jeremie"
,
"Jeremy"
,
"Jermain"
,
"Jermaine"
,
"Jermayne"
,
"Jerome"
,
"Jeromy"
,
"Jerri"
,
"Jerrie"
,
"Jerrold"
,
"Jerrome"
,
"Jerry"
,
"Jervis"
,
"Jess"
,
"Jesse"
,
"Jessee"
,
"Jessey"
,
"Jessie"
,
"Jesus"
,
"Jeth"
,
"Jethro"
,
"Jim"
,
"Jimmie"
,
"Jimmy"
,
"Jo"
,
"Joachim"
,
"Joaquin"
,
"Job"
,
"Jock"
,
"Jocko"
,
"Jodi"
,
"Jodie"
,
"Jody"
,
"Joe"
,
"Joel"
,
"Joey"
,
"Johan"
,
"Johann"
,
"Johannes"
,
"John"
,
"Johnathan"
,
"Johnathon"
,
"Johnnie"
,
"Johnny"
,
"Johny"
,
"Jon"
,
"Jonah"
,
"Jonas"
,
"Jonathan"
,
"Jonathon"
,
"Jone"
,
"Jordan"
,
"Jordon"
,
"Jorgan"
,
"Jorge"
,
"Jory"
,
"Jose"
,
"Joseito"
,
"Joseph"
,
"Josh"
,
"Joshia"
,
"Joshua"
,
"Joshuah"
,
"Josiah"
,
"Josias"
,
"Jourdain"
,
"Jozef"
,
"Juan"
,
"Jud"
,
"Judah"
,
"Judas"
,
"Judd"
,
"Jude"
,
"Judon"
,
"Jule"
,
"Jules"
,
"Julian"
,
"Julie"
,
"Julio"
,
"Julius"
,
"Justen"
,
"Justin"
,
"Justinian"
,
"Justino"
,
"Justis"
,
"Justus"
,
"Kahaleel"
,
"Kahlil"
,
"Kain"
,
"Kaine"
,
"Kaiser"
,
"Kale"
,
"Kaleb"
,
"Kalil"
,
"Kalle"
,
"Kalvin"
,
"Kane"
,
"Kareem"
,
"Karel"
,
"Karim"
,
"Karl"
,
"Karlan"
,
"Karlens"
,
"Karlik"
,
"Karlis"
,
"Karney"
,
"Karoly"
,
"Kaspar"
,
"Kasper"
,
"Kayne"
,
"Kean"
,
"Keane"
,
"Kearney"
,
"Keary"
,
"Keefe"
,
"Keefer"
,
"Keelby"
,
"Keen"
,
"Keenan"
,
"Keene"
,
"Keir"
,
"Keith"
,
"Kelbee"
,
"Kelby"
,
"Kele"
,
"Kellby"
,
"Kellen"
,
"Kelley"
,
"Kelly"
,
"Kelsey"
,
"Kelvin"
,
"Kelwin"
,
"Ken"
,
"Kendal"
,
"Kendall"
,
"Kendell"
,
"Kendrick"
,
"Kendricks"
,
"Kenn"
,
"Kennan"
,
"Kennedy"
,
"Kenneth"
,
"Kennett"
,
"Kennie"
,
"Kennith"
,
"Kenny"
,
"Kenon"
,
"Kent"
,
"Kenton"
,
"Kenyon"
,
"Ker"
,
"Kerby"
,
"Kerk"
,
"Kermie"
,
"Kermit"
,
"Kermy"
,
"Kerr"
,
"Kerry"
,
"Kerwin"
,
"Kerwinn"
,
"Kev"
,
"Kevan"
,
"Keven"
,
"Kevin"
,
"Kevon"
,
"Khalil"
,
"Kiel"
,
"Kienan"
,
"Kile"
,
"Kiley"
,
"Kilian"
,
"Killian"
,
"Killie"
,
"Killy"
,
"Kim"
,
"Kimball"
,
"Kimbell"
,
"Kimble"
,
"Kin"
,
"Kincaid"
,
"King"
,
"Kingsley"
,
"Kingsly"
,
"Kingston"
,
"Kinnie"
,
"Kinny"
,
"Kinsley"
,
"Kip"
,
"Kipp"
,
"Kippar"
,
"Kipper"
,
"Kippie"
,
"Kippy"
,
"Kirby"
,
"Kirk"
,
"Kit"
,
"Klaus"
,
"Klemens"
,
"Klement"
,
"Kleon"
,
"Kliment"
,
"Knox"
,
"Koenraad"
,
"Konrad"
,
"Konstantin"
,
"Konstantine"
,
"Korey"
,
"Kort"
,
"Kory"
,
"Kris"
,
"Krisha"
,
"Krishna"
,
"Krishnah"
,
"Krispin"
,
"Kristian"
,
"Kristo"
,
"Kristofer"
,
"Kristoffer"
,
"Kristofor"
,
"Kristoforo"
,
"Kristopher"
,
"Kristos"
,
"Kurt"
,
"Kurtis"
,
"Ky"
,
"Kyle"
,
"Kylie"
,
"Laird"
,
"Lalo"
,
"Lamar"
,
"Lambert"
,
"Lammond"
,
"Lamond"
,
"Lamont"
,
"Lance"
,
"Lancelot"
,
"Land"
,
"Lane"
,
"Laney"
,
"Langsdon"
,
"Langston"
,
"Lanie"
,
"Lannie"
,
"Lanny"
,
"Larry"
,
"Lars"
,
"Laughton"
,
"Launce"
,
"Lauren"
,
"Laurence"
,
"Laurens"
,
"Laurent"
,
"Laurie"
,
"Lauritz"
,
"Law"
,
"Lawrence"
,
"Lawry"
,
"Lawton"
,
"Lay"
,
"Layton"
,
"Lazar"
,
"Lazare"
,
"Lazaro"
,
"Lazarus"
,
"Lee"
,
"Leeland"
,
"Lefty"
,
"Leicester"
,
"Leif"
,
"Leigh"
,
"Leighton"
,
"Lek"
,
"Leland"
,
"Lem"
,
"Lemar"
,
"Lemmie"
,
"Lemmy"
,
"Lemuel"
,
"Lenard"
,
"Lenci"
,
"Lennard"
,
"Lennie"
,
"Leo"
,
"Leon"
,
"Leonard"
,
"Leonardo"
,
"Leonerd"
,
"Leonhard"
,
"Leonid"
,
"Leonidas"
,
"Leopold"
,
"Leroi"
,
"Leroy"
,
"Les"
,
"Lesley"
,
"Leslie"
,
"Lester"
,
"Leupold"
,
"Lev"
,
"Levey"
,
"Levi"
,
"Levin"
,
"Levon"
,
"Levy"
,
"Lew"
,
"Lewes"
,
"Lewie"
,
"Lewiss"
,
"Lezley"
,
"Liam"
,
"Lief"
,
"Lin"
,
"Linc"
,
"Lincoln"
,
"Lind"
,
"Lindon"
,
"Lindsay"
,
"Lindsey"
,
"Lindy"
,
"Link"
,
"Linn"
,
"Linoel"
,
"Linus"
,
"Lion"
,
"Lionel"
,
"Lionello"
,
"Lisle"
,
"Llewellyn"
,
"Lloyd"
,
"Llywellyn"
,
"Lock"
,
"Locke"
,
"Lockwood"
,
"Lodovico"
,
"Logan"
,
"Lombard"
,
"Lon"
,
"Lonnard"
,
"Lonnie"
,
"Lonny"
,
"Lorant"
,
"Loren"
,
"Lorens"
,
"Lorenzo"
,
"Lorin"
,
"Lorne"
,
"Lorrie"
,
"Lorry"
,
"Lothaire"
,
"Lothario"
,
"Lou"
,
"Louie"
,
"Louis"
,
"Lovell"
,
"Lowe"
,
"Lowell"
,
"Lowrance"
,
"Loy"
,
"Loydie"
,
"Luca"
,
"Lucais"
,
"Lucas"
,
"Luce"
,
"Lucho"
,
"Lucian"
,
"Luciano"
,
"Lucias"
,
"Lucien"
,
"Lucio"
,
"Lucius"
,
"Ludovico"
,
"Ludvig"
,
"Ludwig"
,
"Luigi"
,
"Luis"
,
"Lukas"
,
"Luke"
,
"Lutero"
,
"Luther"
,
"Ly"
,
"Lydon"
,
"Lyell"
,
"Lyle"
,
"Lyman"
,
"Lyn"
,
"Lynn"
,
"Lyon"
,
"Mac"
,
"Mace"
,
"Mack"
,
"Mackenzie"
,
"Maddie"
,
"Maddy"
,
"Madison"
,
"Magnum"
,
"Mahmoud"
,
"Mahmud"
,
"Maison"
,
"Maje"
,
"Major"
,
"Mal"
,
"Malachi"
,
"Malchy"
,
"Malcolm"
,
"Mallory"
,
"Malvin"
,
"Man"
,
"Mandel"
,
"Manfred"
,
"Mannie"
,
"Manny"
,
"Mano"
,
"Manolo"
,
"Manuel"
,
"Mar"
,
"Marc"
,
"Marcel"
,
"Marcello"
,
"Marcellus"
,
"Marcelo"
,
"Marchall"
,
"Marco"
,
"Marcos"
,
"Marcus"
,
"Marijn"
,
"Mario"
,
"Marion"
,
"Marius"
,
"Mark"
,
"Markos"
,
"Markus"
,
"Marlin"
,
"Marlo"
,
"Marlon"
,
"Marlow"
,
"Marlowe"
,
"Marmaduke"
,
"Marsh"
,
"Marshal"
,
"Marshall"
,
"Mart"
,
"Martainn"
,
"Marten"
,
"Martie"
,
"Martin"
,
"Martino"
,
"Marty"
,
"Martyn"
,
"Marv"
,
"Marve"
,
"Marven"
,
"Marvin"
,
"Marwin"
,
"Mason"
,
"Massimiliano"
,
"Massimo"
,
"Mata"
,
"Mateo"
,
"Mathe"
,
"Mathew"
,
"Mathian"
,
"Mathias"
,
"Matias"
,
"Matt"
,
"Matteo"
,
"Matthaeus"
,
"Mattheus"
,
"Matthew"
,
"Matthias"
,
"Matthieu"
,
"Matthiew"
,
"Matthus"
,
"Mattias"
,
"Mattie"
,
"Matty"
,
"Maurice"
,
"Mauricio"
,
"Maurie"
,
"Maurise"
,
"Maurits"
,
"Maurizio"
,
"Maury"
,
"Max"
,
"Maxie"
,
"Maxim"
,
"Maximilian"
,
"Maximilianus"
,
"Maximilien"
,
"Maximo"
,
"Maxwell"
,
"Maxy"
,
"Mayer"
,
"Maynard"
,
"Mayne"
,
"Maynord"
,
"Mayor"
,
"Mead"
,
"Meade"
,
"Meier"
,
"Meir"
,
"Mel"
,
"Melvin"
,
"Melvyn"
,
"Menard"
,
"Mendel"
,
"Mendie"
,
"Mendy"
,
"Meredeth"
,
"Meredith"
,
"Merell"
,
"Merill"
,
"Merle"
,
"Merrel"
,
"Merrick"
,
"Merrill"
,
"Merry"
,
"Merv"
,
"Mervin"
,
"Merwin"
,
"Merwyn"
,
"Meryl"
,
"Meyer"
,
"Mic"
,
"Micah"
,
"Michael"
,
"Michail"
,
"Michal"
,
"Michale"
,
"Micheal"
,
"Micheil"
,
"Michel"
,
"Michele"
,
"Mick"
,
"Mickey"
,
"Mickie"
,
"Micky"
,
"Miguel"
,
"Mikael"
,
"Mike"
,
"Mikel"
,
"Mikey"
,
"Mikkel"
,
"Mikol"
,
"Mile"
,
"Miles"
,
"Mill"
,
"Millard"
,
"Miller"
,
"Milo"
,
"Milt"
,
"Miltie"
,
"Milton"
,
"Milty"
,
"Miner"
,
"Minor"
,
"Mischa"
,
"Mitch"
,
"Mitchael"
,
"Mitchel"
,
"Mitchell"
,
"Moe"
,
"Mohammed"
,
"Mohandas"
,
"Mohandis"
,
"Moise"
,
"Moises"
,
"Moishe"
,
"Monro"
,
"Monroe"
,
"Montague"
,
"Monte"
,
"Montgomery"
,
"Monti"
,
"Monty"
,
"Moore"
,
"Mord"
,
"Mordecai"
,
"Mordy"
,
"Morey"
,
"Morgan"
,
"Morgen"
,
"Morgun"
,
"Morie"
,
"Moritz"
,
"Morlee"
,
"Morley"
,
"Morly"
,
"Morrie"
,
"Morris"
,
"Morry"
,
"Morse"
,
"Mort"
,
"Morten"
,
"Mortie"
,
"Mortimer"
,
"Morton"
,
"Morty"
,
"Mose"
,
"Moses"
,
"Moshe"
,
"Moss"
,
"Mozes"
,
"Muffin"
,
"Muhammad"
,
"Munmro"
,
"Munroe"
,
"Murdoch"
,
"Murdock"
,
"Murray"
,
"Murry"
,
"Murvyn"
,
"My"
,
"Myca"
,
"Mycah"
,
"Mychal"
,
"Myer"
,
"Myles"
,
"Mylo"
,
"Myron"
,
"Myrvyn"
,
"Myrwyn"
,
"Nahum"
,
"Nap"
,
"Napoleon"
,
"Nappie"
,
"Nappy"
,
"Nat"
,
"Natal"
,
"Natale"
,
"Nataniel"
,
"Nate"
,
"Nathan"
,
"Nathanael"
,
"Nathanial"
,
"Nathaniel"
,
"Nathanil"
,
"Natty"
,
"Neal"
,
"Neale"
,
"Neall"
,
"Nealon"
,
"Nealson"
,
"Nealy"
,
"Ned"
,
"Neddie"
,
"Neddy"
,
"Neel"
,
"Nefen"
,
"Nehemiah"
,
"Neil"
,
"Neill"
,
"Neils"
,
"Nels"
,
"Nelson"
,
"Nero"
,
"Neron"
,
"Nester"
,
"Nestor"
,
"Nev"
,
"Nevil"
,
"Nevile"
,
"Neville"
,
"Nevin"
,
"Nevins"
,
"Newton"
,
"Nial"
,
"Niall"
,
"Niccolo"
,
"Nicholas"
,
"Nichole"
,
"Nichols"
,
"Nick"
,
"Nickey"
,
"Nickie"
,
"Nicko"
,
"Nickola"
,
"Nickolai"
,
"Nickolas"
,
"Nickolaus"
,
"Nicky"
,
"Nico"
,
"Nicol"
,
"Nicola"
,
"Nicolai"
,
"Nicolais"
,
"Nicolas"
,
"Nicolis"
,
"Niel"
,
"Niels"
,
"Nigel"
,
"Niki"
,
"Nikita"
,
"Nikki"
,
"Niko"
,
"Nikola"
,
"Nikolai"
,
"Nikolaos"
,
"Nikolas"
,
"Nikolaus"
,
"Nikolos"
,
"Nikos"
,
"Nil"
,
"Niles"
,
"Nils"
,
"Nilson"
,
"Niven"
,
"Noach"
,
"Noah"
,
"Noak"
,
"Noam"
,
"Nobe"
,
"Nobie"
,
"Noble"
,
"Noby"
,
"Noe"
,
"Noel"
,
"Nolan"
,
"Noland"
,
"Noll"
,
"Nollie"
,
"Nolly"
,
"Norbert"
,
"Norbie"
,
"Norby"
,
"Norman"
,
"Normand"
,
"Normie"
,
"Normy"
,
"Norrie"
,
"Norris"
,
"Norry"
,
"North"
,
"Northrop"
,
"Northrup"
,
"Norton"
,
"Nowell"
,
"Nye"
,
"Oates"
,
"Obadiah"
,
"Obadias"
,
"Obed"
,
"Obediah"
,
"Oberon"
,
"Obidiah"
,
"Obie"
,
"Oby"
,
"Octavius"
,
"Ode"
,
"Odell"
,
"Odey"
,
"Odie"
,
"Odo"
,
"Ody"
,
"Ogdan"
,
"Ogden"
,
"Ogdon"
,
"Olag"
,
"Olav"
,
"Ole"
,
"Olenolin"
,
"Olin"
,
"Oliver"
,
"Olivero"
,
"Olivier"
,
"Oliviero"
,
"Ollie"
,
"Olly"
,
"Olvan"
,
"Omar"
,
"Omero"
,
"Onfre"
,
"Onfroi"
,
"Onofredo"
,
"Oran"
,
"Orazio"
,
"Orbadiah"
,
"Oren"
,
"Orin"
,
"Orion"
,
"Orlan"
,
"Orland"
,
"Orlando"
,
"Orran"
,
"Orren"
,
"Orrin"
,
"Orson"
,
"Orton"
,
"Orv"
,
"Orville"
,
"Osbert"
,
"Osborn"
,
"Osborne"
,
"Osbourn"
,
"Osbourne"
,
"Osgood"
,
"Osmond"
,
"Osmund"
,
"Ossie"
,
"Oswald"
,
"Oswell"
,
"Otes"
,
"Othello"
,
"Otho"
,
"Otis"
,
"Otto"
,
"Owen"
,
"Ozzie"
,
"Ozzy"
,
"Pablo"
,
"Pace"
,
"Packston"
,
"Paco"
,
"Pacorro"
,
"Paddie"
,
"Paddy"
,
"Padget"
,
"Padgett"
,
"Padraic"
,
"Padraig"
,
"Padriac"
,
"Page"
,
"Paige"
,
"Pail"
,
"Pall"
,
"Palm"
,
"Palmer"
,
"Panchito"
,
"Pancho"
,
"Paolo"
,
"Papageno"
,
"Paquito"
,
"Park"
,
"Parke"
,
"Parker"
,
"Parnell"
,
"Parrnell"
,
"Parry"
,
"Parsifal"
,
"Pascal"
,
"Pascale"
,
"Pasquale"
,
"Pat"
,
"Pate"
,
"Paten"
,
"Patin"
,
"Paton"
,
"Patric"
,
"Patrice"
,
"Patricio"
,
"Patrick"
,
"Patrizio"
,
"Patrizius"
,
"Patsy"
,
"Patten"
,
"Pattie"
,
"Pattin"
,
"Patton"
,
"Patty"
,
"Paul"
,
"Paulie"
,
"Paulo"
,
"Pauly"
,
"Pavel"
,
"Pavlov"
,
"Paxon"
,
"Paxton"
,
"Payton"
,
"Peadar"
,
"Pearce"
,
"Pebrook"
,
"Peder"
,
"Pedro"
,
"Peirce"
,
"Pembroke"
,
"Pen"
,
"Penn"
,
"Pennie"
,
"Penny"
,
"Penrod"
,
"Pepe"
,
"Pepillo"
,
"Pepito"
,
"Perceval"
,
"Percival"
,
"Percy"
,
"Perice"
,
"Perkin"
,
"Pernell"
,
"Perren"
,
"Perry"
,
"Pete"
,
"Peter"
,
"Peterus"
,
"Petey"
,
"Petr"
,
"Peyter"
,
"Peyton"
,
"Phil"
,
"Philbert"
,
"Philip"
,
"Phillip"
,
"Phillipe"
,
"Phillipp"
,
"Phineas"
,
"Phip"
,
"Pierce"
,
"Pierre"
,
"Pierson"
,
"Pieter"
,
"Pietrek"
,
"Pietro"
,
"Piggy"
,
"Pincas"
,
"Pinchas"
,
"Pincus"
,
"Piotr"
,
"Pip"
,
"Pippo"
,
"Pooh"
,
"Port"
,
"Porter"
,
"Portie"
,
"Porty"
,
"Poul"
,
"Powell"
,
"Pren"
,
"Prent"
,
"Prentice"
,
"Prentiss"
,
"Prescott"
,
"Preston"
,
"Price"
,
"Prince"
,
"Prinz"
,
"Pryce"
,
"Puff"
,
"Purcell"
,
"Putnam"
,
"Putnem"
,
"Pyotr"
,
"Quent"
,
"Quentin"
,
"Quill"
,
"Quillan"
,
"Quincey"
,
"Quincy"
,
"Quinlan"
,
"Quinn"
,
"Quint"
,
"Quintin"
,
"Quinton"
,
"Quintus"
,
"Rab"
,
"Rabbi"
,
"Rabi"
,
"Rad"
,
"Radcliffe"
,
"Raddie"
,
"Raddy"
,
"Rafael"
,
"Rafaellle"
,
"Rafaello"
,
"Rafe"
,
"Raff"
,
"Raffaello"
,
"Raffarty"
,
"Rafferty"
,
"Rafi"
,
"Ragnar"
,
"Raimondo"
,
"Raimund"
,
"Raimundo"
,
"Rainer"
,
"Raleigh"
,
"Ralf"
,
"Ralph"
,
"Ram"
,
"Ramon"
,
"Ramsay"
,
"Ramsey"
,
"Rance"
,
"Rancell"
,
"Rand"
,
"Randal"
,
"Randall"
,
"Randell"
,
"Randi"
,
"Randie"
,
"Randolf"
,
"Randolph"
,
"Randy"
,
"Ransell"
,
"Ransom"
,
"Raoul"
,
"Raphael"
,
"Raul"
,
"Ravi"
,
"Ravid"
,
"Raviv"
,
"Rawley"
,
"Ray"
,
"Raymond"
,
"Raymund"
,
"Raynard"
,
"Rayner"
,
"Raynor"
,
"Read"
,
"Reade"
,
"Reagan"
,
"Reagen"
,
"Reamonn"
,
"Red"
,
"Redd"
,
"Redford"
,
"Reece"
,
"Reed"
,
"Rees"
,
"Reese"
,
"Reg"
,
"Regan"
,
"Regen"
,
"Reggie"
,
"Reggis"
,
"Reggy"
,
"Reginald"
,
"Reginauld"
,
"Reid"
,
"Reidar"
,
"Reider"
,
"Reilly"
,
"Reinald"
,
"Reinaldo"
,
"Reinaldos"
,
"Reinhard"
,
"Reinhold"
,
"Reinold"
,
"Reinwald"
,
"Rem"
,
"Remington"
,
"Remus"
,
"Renado"
,
"Renaldo"
,
"Renard"
,
"Renato"
,
"Renaud"
,
"Renault"
,
"Rene"
,
"Reube"
,
"Reuben"
,
"Reuven"
,
"Rex"
,
"Rey"
,
"Reynard"
,
"Reynold"
,
"Reynolds"
,
"Rhett"
,
"Rhys"
,
"Ric"
,
"Ricard"
,
"Ricardo"
,
"Riccardo"
,
"Rice"
,
"Rich"
,
"Richard"
,
"Richardo"
,
"Richart"
,
"Richie"
,
"Richmond"
,
"Richmound"
,
"Richy"
,
"Rick"
,
"Rickard"
,
"Rickert"
,
"Rickey"
,
"Ricki"
,
"Rickie"
,
"Ricky"
,
"Ricoriki"
,
"Rik"
,
"Rikki"
,
"Riley"
,
"Rinaldo"
,
"Ring"
,
"Ringo"
,
"Riobard"
,
"Riordan"
,
"Rip"
,
"Ripley"
,
"Ritchie"
,
"Roarke"
,
"Rob"
,
"Robb"
,
"Robbert"
,
"Robbie"
,
"Robby"
,
"Robers"
,
"Robert"
,
"Roberto"
,
"Robin"
,
"Robinet"
,
"Robinson"
,
"Rochester"
,
"Rock"
,
"Rockey"
,
"Rockie"
,
"Rockwell"
,
"Rocky"
,
"Rod"
,
"Rodd"
,
"Roddie"
,
"Roddy"
,
"Roderic"
,
"Roderich"
,
"Roderick"
,
"Roderigo"
,
"Rodge"
,
"Rodger"
,
"Rodney"
,
"Rodolfo"
,
"Rodolph"
,
"Rodolphe"
,
"Rodrick"
,
"Rodrigo"
,
"Rodrique"
,
"Rog"
,
"Roger"
,
"Rogerio"
,
"Rogers"
,
"Roi"
,
"Roland"
,
"Rolando"
,
"Roldan"
,
"Roley"
,
"Rolf"
,
"Rolfe"
,
"Rolland"
,
"Rollie"
,
"Rollin"
,
"Rollins"
,
"Rollo"
,
"Rolph"
,
"Roma"
,
"Romain"
,
"Roman"
,
"Romeo"
,
"Ron"
,
"Ronald"
,
"Ronnie"
,
"Ronny"
,
"Rooney"
,
"Roosevelt"
,
"Rorke"
,
"Rory"
,
"Rosco"
,
"Roscoe"
,
"Ross"
,
"Rossie"
,
"Rossy"
,
"Roth"
,
"Rourke"
,
"Rouvin"
,
"Rowan"
,
"Rowen"
,
"Rowland"
,
"Rowney"
,
"Roy"
,
"Royal"
,
"Royall"
,
"Royce"
,
"Rriocard"
,
"Rube"
,
"Ruben"
,
"Rubin"
,
"Ruby"
,
"Rudd"
,
"Ruddie"
,
"Ruddy"
,
"Rudie"
,
"Rudiger"
,
"Rudolf"
,
"Rudolfo"
,
"Rudolph"
,
"Rudy"
,
"Rudyard"
,
"Rufe"
,
"Rufus"
,
"Ruggiero"
,
"Rupert"
,
"Ruperto"
,
"Ruprecht"
,
"Rurik"
,
"Russ"
,
"Russell"
,
"Rustie"
,
"Rustin"
,
"Rusty"
,
"Rutger"
,
"Rutherford"
,
"Rutledge"
,
"Rutter"
,
"Ruttger"
,
"Ruy"
,
"Ryan"
,
"Ryley"
,
"Ryon"
,
"Ryun"
,
"Sal"
,
"Saleem"
,
"Salem"
,
"Salim"
,
"Salmon"
,
"Salomo"
,
"Salomon"
,
"Salomone"
,
"Salvador"
,
"Salvatore"
,
"Salvidor"
,
"Sam"
,
"Sammie"
,
"Sammy"
,
"Sampson"
,
"Samson"
,
"Samuel"
,
"Samuele"
,
"Sancho"
,
"Sander"
,
"Sanders"
,
"Sanderson"
,
"Sandor"
,
"Sandro"
,
"Sandy"
,
"Sanford"
,
"Sanson"
,
"Sansone"
,
"Sarge"
,
"Sargent"
,
"Sascha"
,
"Sasha"
,
"Saul"
,
"Sauncho"
,
"Saunder"
,
"Saunders"
,
"Saunderson"
,
"Saundra"
,
"Sauveur"
,
"Saw"
,
"Sawyer"
,
"Sawyere"
,
"Sax"
,
"Saxe"
,
"Saxon"
,
"Say"
,
"Sayer"
,
"Sayers"
,
"Sayre"
,
"Sayres"
,
"Scarface"
,
"Schuyler"
,
"Scot"
,
"Scott"
,
"Scotti"
,
"Scottie"
,
"Scotty"
,
"Seamus"
,
"Sean"
,
"Sebastian"
,
"Sebastiano"
,
"Sebastien"
,
"See"
,
"Selby"
,
"Selig"
,
"Serge"
,
"Sergeant"
,
"Sergei"
,
"Sergent"
,
"Sergio"
,
"Seth"
,
"Seumas"
,
"Seward"
,
"Seymour"
,
"Shadow"
,
"Shae"
,
"Shaine"
,
"Shalom"
,
"Shamus"
,
"Shanan"
,
"Shane"
,
"Shannan"
,
"Shannon"
,
"Shaughn"
,
"Shaun"
,
"Shaw"
,
"Shawn"
,
"Shay"
,
"Shayne"
,
"Shea"
,
"Sheff"
,
"Sheffie"
,
"Sheffield"
,
"Sheffy"
,
"Shelby"
,
"Shelden"
,
"Shell"
,
"Shelley"
,
"Shelton"
,
"Shem"
,
"Shep"
,
"Shepard"
,
"Shepherd"
,
"Sheppard"
,
"Shepperd"
,
"Sheridan"
,
"Sherlock"
,
"Sherlocke"
,
"Sherm"
,
"Sherman"
,
"Shermie"
,
"Shermy"
,
"Sherwin"
,
"Sherwood"
,
"Sherwynd"
,
"Sholom"
,
"Shurlock"
,
"Shurlocke"
,
"Shurwood"
,
"Si"
,
"Sibyl"
,
"Sid"
,
"Sidnee"
,
"Sidney"
,
"Siegfried"
,
"Siffre"
,
"Sig"
,
"Sigfrid"
,
"Sigfried"
,
"Sigismond"
,
"Sigismondo"
,
"Sigismund"
,
"Sigismundo"
,
"Sigmund"
,
"Sigvard"
,
"Silas"
,
"Silvain"
,
"Silvan"
,
"Silvano"
,
"Silvanus"
,
"Silvester"
,
"Silvio"
,
"Sim"
,
"Simeon"
,
"Simmonds"
,
"Simon"
,
"Simone"
,
"Sinclair"
,
"Sinclare"
,
"Siward"
,
"Skell"
,
"Skelly"
,
"Skip"
,
"Skipp"
,
"Skipper"
,
"Skippie"
,
"Skippy"
,
"Skipton"
,
"Sky"
,
"Skye"
,
"Skylar"
,
"Skyler"
,
"Slade"
,
"Sloan"
,
"Sloane"
,
"Sly"
,
"Smith"
,
"Smitty"
,
"Sol"
,
"Sollie"
,
"Solly"
,
"Solomon"
,
"Somerset"
,
"Son"
,
"Sonnie"
,
"Sonny"
,
"Spence"
,
"Spencer"
,
"Spense"
,
"Spenser"
,
"Spike"
,
"Stacee"
,
"Stacy"
,
"Staffard"
,
"Stafford"
,
"Staford"
,
"Stan"
,
"Standford"
,
"Stanfield"
,
"Stanford"
,
"Stanislas"
,
"Stanislaus"
,
"Stanislaw"
,
"Stanleigh"
,
"Stanley"
,
"Stanly"
,
"Stanton"
,
"Stanwood"
,
"Stavro"
,
"Stavros"
,
"Stearn"
,
"Stearne"
,
"Stefan"
,
"Stefano"
,
"Steffen"
,
"Stephan"
,
"Stephanus"
,
"Stephen"
,
"Sterling"
,
"Stern"
,
"Sterne"
,
"Steve"
,
"Steven"
,
"Stevie"
,
"Stevy"
,
"Steward"
,
"Stewart"
,
"Stillman"
,
"Stillmann"
,
"Stinky"
,
"Stirling"
,
"Stu"
,
"Stuart"
,
"Sullivan"
,
"Sully"
,
"Sumner"
,
"Sunny"
,
"Sutherlan"
,
"Sutherland"
,
"Sutton"
,
"Sven"
,
"Svend"
,
"Swen"
,
"Syd"
,
"Sydney"
,
"Sylas"
,
"Sylvan"
,
"Sylvester"
,
"Syman"
,
"Symon"
,
"Tab"
,
"Tabb"
,
"Tabbie"
,
"Tabby"
,
"Taber"
,
"Tabor"
,
"Tad"
,
"Tadd"
,
"Taddeo"
,
"Taddeusz"
,
"Tadeas"
,
"Tadeo"
,
"Tades"
,
"Tadio"
,
"Tailor"
,
"Tait"
,
"Taite"
,
"Talbert"
,
"Talbot"
,
"Tallie"
,
"Tally"
,
"Tam"
,
"Tamas"
,
"Tammie"
,
"Tammy"
,
"Tan"
,
"Tann"
,
"Tanner"
,
"Tanney"
,
"Tannie"
,
"Tanny"
,
"Tarrance"
,
"Tate"
,
"Taylor"
,
"Teador"
,
"Ted"
,
"Tedd"
,
"Teddie"
,
"Teddy"
,
"Tedie"
,
"Tedman"
,
"Tedmund"
,
"Temp"
,
"Temple"
,
"Templeton"
,
"Teodoor"
,
"Teodor"
,
"Teodorico"
,
"Teodoro"
,
"Terence"
,
"Terencio"
,
"Terrance"
,
"Terrel"
,
"Terrell"
,
"Terrence"
,
"Terri"
,
"Terrill"
,
"Terry"
,
"Thacher"
,
"Thaddeus"
,
"Thaddus"
,
"Thadeus"
,
"Thain"
,
"Thaine"
,
"Thane"
,
"Thatch"
,
"Thatcher"
,
"Thaxter"
,
"Thayne"
,
"Thebault"
,
"Thedric"
,
"Thedrick"
,
"Theo"
,
"Theobald"
,
"Theodor"
,
"Theodore"
,
"Theodoric"
,
"Thibaud"
,
"Thibaut"
,
"Thom"
,
"Thoma"
,
"Thomas"
,
"Thor"
,
"Thorin"
,
"Thorn"
,
"Thorndike"
,
"Thornie"
,
"Thornton"
,
"Thorny"
,
"Thorpe"
,
"Thorstein"
,
"Thorsten"
,
"Thorvald"
,
"Thurstan"
,
"Thurston"
,
"Tibold"
,
"Tiebold"
,
"Tiebout"
,
"Tiler"
,
"Tim"
,
"Timmie"
,
"Timmy"
,
"Timofei"
,
"Timoteo"
,
"Timothee"
,
"Timotheus"
,
"Timothy"
,
"Tirrell"
,
"Tito"
,
"Titos"
,
"Titus"
,
"Tobe"
,
"Tobiah"
,
"Tobias"
,
"Tobie"
,
"Tobin"
,
"Tobit"
,
"Toby"
,
"Tod"
,
"Todd"
,
"Toddie"
,
"Toddy"
,
"Toiboid"
,
"Tom"
,
"Tomas"
,
"Tomaso"
,
"Tome"
,
"Tomkin"
,
"Tomlin"
,
"Tommie"
,
"Tommy"
,
"Tonnie"
,
"Tony"
,
"Tore"
,
"Torey"
,
"Torin"
,
"Torr"
,
"Torrance"
,
"Torre"
,
"Torrence"
,
"Torrey"
,
"Torrin"
,
"Torry"
,
"Town"
,
"Towney"
,
"Townie"
,
"Townsend"
,
"Towny"
,
"Trace"
,
"Tracey"
,
"Tracie"
,
"Tracy"
,
"Traver"
,
"Travers"
,
"Travis"
,
"Travus"
,
"Trefor"
,
"Tremain"
,
"Tremaine"
,
"Tremayne"
,
"Trent"
,
"Trenton"
,
"Trev"
,
"Trevar"
,
"Trever"
,
"Trevor"
,
"Trey"
,
"Trip"
,
"Tripp"
,
"Tris"
,
"Tristam"
,
"Tristan"
,
"Troy"
,
"Trstram"
,
"Trueman"
,
"Trumaine"
,
"Truman"
,
"Trumann"
,
"Tuck"
,
"Tucker"
,
"Tuckie"
,
"Tucky"
,
"Tudor"
,
"Tull"
,
"Tulley"
,
"Tully"
,
"Turner"
,
"Ty"
,
"Tybalt"
,
"Tye"
,
"Tyler"
,
"Tymon"
,
"Tymothy"
,
"Tynan"
,
"Tyrone"
,
"Tyrus"
,
"Tyson"
,
"Udale"
,
"Udall"
,
"Udell"
,
"Ugo"
,
"Ulberto"
,
"Ulick"
,
"Ulises"
,
"Ulric"
,
"Ulrich"
,
"Ulrick"
,
"Ulysses"
,
"Umberto"
,
"Upton"
,
"Urbain"
,
"Urban"
,
"Urbano"
,
"Urbanus"
,
"Uri"
,
"Uriah"
,
"Uriel"
,
"Urson"
,
"Vachel"
,
"Vaclav"
,
"Vail"
,
"Val"
,
"Valdemar"
,
"Vale"
,
"Valentijn"
,
"Valentin"
,
"Valentine"
,
"Valentino"
,
"Valle"
,
"Van"
,
"Vance"
,
"Vanya"
,
"Vasili"
,
"Vasilis"
,
"Vasily"
,
"Vassili"
,
"Vassily"
,
"Vaughan"
,
"Vaughn"
,
"Verge"
,
"Vergil"
,
"Vern"
,
"Verne"
,
"Vernen"
,
"Verney"
,
"Vernon"
,
"Vernor"
,
"Vic"
,
"Vick"
,
"Victoir"
,
"Victor"
,
"Vidovic"
,
"Vidovik"
,
"Vin"
,
"Vince"
,
"Vincent"
,
"Vincents"
,
"Vincenty"
,
"Vincenz"
,
"Vinnie"
,
"Vinny"
,
"Vinson"
,
"Virge"
,
"Virgie"
,
"Virgil"
,
"Virgilio"
,
"Vite"
,
"Vito"
,
"Vittorio"
,
"Vlad"
,
"Vladamir"
,
"Vladimir"
,
"Von"
,
"Wade"
,
"Wadsworth"
,
"Wain"
,
"Wainwright"
,
"Wait"
,
"Waite"
,
"Waiter"
,
"Wake"
,
"Wakefield"
,
"Wald"
,
"Waldemar"
,
"Walden"
,
"Waldo"
,
"Waldon"
,
"Walker"
,
"Wallace"
,
"Wallache"
,
"Wallas"
,
"Wallie"
,
"Wallis"
,
"Wally"
,
"Walsh"
,
"Walt"
,
"Walther"
,
"Walton"
,
"Wang"
,
"Ward"
,
"Warde"
,
"Warden"
,
"Ware"
,
"Waring"
,
"Warner"
,
"Warren"
,
"Wash"
,
"Washington"
,
"Wat"
,
"Waverley"
,
"Waverly"
,
"Way"
,
"Waylan"
,
"Wayland"
,
"Waylen"
,
"Waylin"
,
"Waylon"
,
"Wayne"
,
"Web"
,
"Webb"
,
"Weber"
,
"Webster"
,
"Weidar"
,
"Weider"
,
"Welbie"
,
"Welby"
,
"Welch"
,
"Wells"
,
"Welsh"
,
"Wendall"
,
"Wendel"
,
"Wendell"
,
"Werner"
,
"Wernher"
,
"Wes"
,
"Wesley"
,
"West"
,
"Westbrook"
,
"Westbrooke"
,
"Westleigh"
,
"Westley"
,
"Weston"
,
"Weylin"
,
"Wheeler"
,
"Whit"
,
"Whitaker"
,
"Whitby"
,
"Whitman"
,
"Whitney"
,
"Whittaker"
,
"Wiatt"
,
"Wilbert"
,
"Wilbur"
,
"Wilburt"
,
"Wilden"
,
"Wildon"
,
"Wilek"
,
"Wiley"
,
"Wilfred"
,
"Wilfrid"
,
"Wilhelm"
,
"Will"
,
"Willard"
,
"Willdon"
,
"Willem"
,
"Willey"
,
"Willi"
,
"William"
,
"Willie"
,
"Willis"
,
"Willy"
,
"Wilmar"
,
"Wilmer"
,
"Wilt"
,
"Wilton"
,
"Win"
,
"Windham"
,
"Winfield"
,
"Winfred"
,
"Winifield"
,
"Winn"
,
"Winnie"
,
"Winny"
,
"Winslow"
,
"Winston"
,
"Winthrop"
,
"Wit"
,
"Wittie"
,
"Witty"
,
"Wolf"
,
"Wolfgang"
,
"Wolfie"
,
"Wolfy"
,
"Wood"
,
"Woodie"
,
"Woodman"
,
"Woodrow"
,
"Woody"
,
"Worden"
,
"Worth"
,
"Worthington"
,
"Worthy"
,
"Wright"
,
"Wyatan"
,
"Wyatt"
,
"Wye"
,
"Wylie"
,
"Wyn"
,
"Wyndham"
,
"Wynn"
,
"Xavier"
,
"Xenos"
,
"Xerxes"
,
"Xever"
,
"Ximenes"
,
"Ximenez"
,
"Xymenes"
,
"Yale"
,
"Yanaton"
,
"Yance"
,
"Yancey"
,
"Yancy"
,
"Yank"
,
"Yankee"
,
"Yard"
,
"Yardley"
,
"Yehudi"
,
"Yehudit"
,
"Yorgo"
,
"Yorgos"
,
"York"
,
"Yorke"
,
"Yorker"
,
"Yul"
,
"Yule"
,
"Yulma"
,
"Yuma"
,
"Yuri"
,
"Yurik"
,
"Yves"
,
"Yvon"
,
"Yvor"
,
"Zaccaria"
,
"Zach"
,
"Zacharia"
,
"Zachariah"
,
"Zacharias"
,
"Zacharie"
,
"Zachary"
,
"Zacherie"
,
"Zachery"
,
"Zack"
,
"Zackariah"
,
"Zak"
,
"Zane"
,
"Zared"
,
"Zeb"
,
"Zebadiah"
,
"Zebedee"
,
"Zebulen"
,
"Zebulon"
,
"Zechariah"
,
"Zed"
,
"Zedekiah"
,
"Zeke"
,
"Zelig"
,
"Zerk"
,
"Zollie"
,
"Zolly"
]

},{}],286:[function(require,module,exports){
module.exports=[
"Aaberg"
,
"Aalst"
,
"Aara"
,
"Aaren"
,
"Aarika"
,
"Aaron"
,
"Aaronson"
,
"Ab"
,
"Aba"
,
"Abad"
,
"Abagael"
,
"Abagail"
,
"Abana"
,
"Abate"
,
"Abba"
,
"Abbate"
,
"Abbe"
,
"Abbey"
,
"Abbi"
,
"Abbie"
,
"Abbot"
,
"Abbotsen"
,
"Abbotson"
,
"Abbotsun"
,
"Abbott"
,
"Abbottson"
,
"Abby"
,
"Abbye"
,
"Abdel"
,
"Abdella"
,
"Abdu"
,
"Abdul"
,
"Abdulla"
,
"Abe"
,
"Abebi"
,
"Abel"
,
"Abelard"
,
"Abell"
,
"Abercromby"
,
"Abernathy"
,
"Abernon"
,
"Abert"
,
"Abeu"
,
"Abey"
,
"Abie"
,
"Abigael"
,
"Abigail"
,
"Abigale"
,
"Abijah"
,
"Abisha"
,
"Abisia"
,
"Abixah"
,
"Abner"
,
"Aborn"
,
"Abott"
,
"Abra"
,
"Abraham"
,
"Abrahams"
,
"Abrahamsen"
,
"Abrahan"
,
"Abram"
,
"Abramo"
,
"Abrams"
,
"Abramson"
,
"Abran"
,
"Abroms"
,
"Absa"
,
"Absalom"
,
"Abshier"
,
"Acacia"
,
"Acalia"
,
"Accalia"
,
"Ace"
,
"Acey"
,
"Acherman"
,
"Achilles"
,
"Achorn"
,
"Acie"
,
"Acima"
,
"Acker"
,
"Ackerley"
,
"Ackerman"
,
"Ackler"
,
"Ackley"
,
"Acquah"
,
"Acus"
,
"Ad"
,
"Ada"
,
"Adabel"
,
"Adabelle"
,
"Adachi"
,
"Adah"
,
"Adaha"
,
"Adai"
,
"Adaiha"
,
"Adair"
,
"Adal"
,
"Adala"
,
"Adalai"
,
"Adalard"
,
"Adalbert"
,
"Adalheid"
,
"Adali"
,
"Adalia"
,
"Adaliah"
,
"Adalie"
,
"Adaline"
,
"Adall"
,
"Adallard"
,
"Adam"
,
"Adama"
,
"Adamec"
,
"Adamek"
,
"Adamik"
,
"Adamina"
,
"Adaminah"
,
"Adamis"
,
"Adamo"
,
"Adamok"
,
"Adams"
,
"Adamsen"
,
"Adamski"
,
"Adamson"
,
"Adamsun"
,
"Adan"
,
"Adao"
,
"Adar"
,
"Adara"
,
"Adaurd"
,
"Aday"
,
"Adda"
,
"Addam"
,
"Addi"
,
"Addia"
,
"Addie"
,
"Addiego"
,
"Addiel"
,
"Addis"
,
"Addison"
,
"Addy"
,
"Ade"
,
"Adebayo"
,
"Adel"
,
"Adela"
,
"Adelaida"
,
"Adelaide"
,
"Adelaja"
,
"Adelbert"
,
"Adele"
,
"Adelheid"
,
"Adelia"
,
"Adelice"
,
"Adelina"
,
"Adelind"
,
"Adeline"
,
"Adella"
,
"Adelle"
,
"Adelpho"
,
"Adelric"
,
"Adena"
,
"Ader"
,
"Adest"
,
"Adey"
,
"Adham"
,
"Adhamh"
,
"Adhern"
,
"Adi"
,
"Adiana"
,
"Adiel"
,
"Adiell"
,
"Adigun"
,
"Adila"
,
"Adim"
,
"Adin"
,
"Adina"
,
"Adine"
,
"Adis"
,
"Adkins"
,
"Adlai"
,
"Adlar"
,
"Adlare"
,
"Adlay"
,
"Adlee"
,
"Adlei"
,
"Adler"
,
"Adley"
,
"Adna"
,
"Adnah"
,
"Adne"
,
"Adnopoz"
,
"Ado"
,
"Adolf"
,
"Adolfo"
,
"Adolph"
,
"Adolphe"
,
"Adolpho"
,
"Adolphus"
,
"Adon"
,
"Adonis"
,
"Adora"
,
"Adore"
,
"Adoree"
,
"Adorl"
,
"Adorne"
,
"Adrea"
,
"Adrell"
,
"Adria"
,
"Adriaens"
,
"Adrial"
,
"Adrian"
,
"Adriana"
,
"Adriane"
,
"Adrianna"
,
"Adrianne"
,
"Adriano"
,
"Adriel"
,
"Adriell"
,
"Adrien"
,
"Adriena"
,
"Adriene"
,
"Adrienne"
,
"Adur"
,
"Aekerly"
,
"Aelber"
,
"Aenea"
,
"Aeneas"
,
"Aeneus"
,
"Aeniah"
,
"Aenneea"
,
"Aeriel"
,
"Aeriela"
,
"Aeriell"
,
"Affer"
,
"Affra"
,
"Affrica"
,
"Afra"
,
"Africa"
,
"Africah"
,
"Afrika"
,
"Afrikah"
,
"Afton"
,
"Ag"
,
"Agace"
,
"Agamemnon"
,
"Agan"
,
"Agata"
,
"Agate"
,
"Agatha"
,
"Agathe"
,
"Agathy"
,
"Agbogla"
,
"Agee"
,
"Aggappe"
,
"Aggappera"
,
"Aggappora"
,
"Aggarwal"
,
"Aggi"
,
"Aggie"
,
"Aggri"
,
"Aggy"
,
"Agle"
,
"Agler"
,
"Agna"
,
"Agnella"
,
"Agnes"
,
"Agnese"
,
"Agnesse"
,
"Agneta"
,
"Agnew"
,
"Agnola"
,
"Agostino"
,
"Agosto"
,
"Agretha"
,
"Agripina"
,
"Agrippina"
,
"Aguayo"
,
"Agueda"
,
"Aguie"
,
"Aguste"
,
"Agustin"
,
"Ahab"
,
"Aharon"
,
"Ahasuerus"
,
"Ahders"
,
"Ahearn"
,
"Ahern"
,
"Ahl"
,
"Ahlgren"
,
"Ahmad"
,
"Ahmar"
,
"Ahmed"
,
"Ahola"
,
"Aholah"
,
"Aholla"
,
"Ahoufe"
,
"Ahouh"
,
"Ahrendt"
,
"Ahrens"
,
"Ahron"
,
"Aia"
,
"Aida"
,
"Aidan"
,
"Aiden"
,
"Aiello"
,
"Aigneis"
,
"Aiken"
,
"Aila"
,
"Ailbert"
,
"Aile"
,
"Ailee"
,
"Aileen"
,
"Ailene"
,
"Ailey"
,
"Aili"
,
"Ailin"
,
"Ailina"
,
"Ailis"
,
"Ailsa"
,
"Ailssa"
,
"Ailsun"
,
"Ailyn"
,
"Aime"
,
"Aimee"
,
"Aimil"
,
"Aimo"
,
"Aindrea"
,
"Ainslee"
,
"Ainsley"
,
"Ainslie"
,
"Ainsworth"
,
"Airel"
,
"Aires"
,
"Airla"
,
"Airlee"
,
"Airlia"
,
"Airliah"
,
"Airlie"
,
"Aisha"
,
"Ajani"
,
"Ajax"
,
"Ajay"
,
"Ajit"
,
"Akanke"
,
"Akel"
,
"Akela"
,
"Aker"
,
"Akerboom"
,
"Akerley"
,
"Akers"
,
"Akeyla"
,
"Akeylah"
,
"Akili"
,
"Akim"
,
"Akin"
,
"Akins"
,
"Akira"
,
"Aklog"
,
"Aksel"
,
"Aksoyn"
,
"Al"
,
"Alabaster"
,
"Alage"
,
"Alain"
,
"Alaine"
,
"Alair"
,
"Alake"
,
"Alameda"
,
"Alan"
,
"Alana"
,
"Alanah"
,
"Aland"
,
"Alane"
,
"Alanna"
,
"Alano"
,
"Alansen"
,
"Alanson"
,
"Alard"
,
"Alaric"
,
"Alarice"
,
"Alarick"
,
"Alarise"
,
"Alasdair"
,
"Alastair"
,
"Alasteir"
,
"Alaster"
,
"Alatea"
,
"Alathia"
,
"Alayne"
,
"Alba"
,
"Alban"
,
"Albarran"
,
"Albemarle"
,
"Alben"
,
"Alber"
,
"Alberic"
,
"Alberik"
,
"Albers"
,
"Albert"
,
"Alberta"
,
"Albertina"
,
"Albertine"
,
"Alberto"
,
"Albertson"
,
"Albie"
,
"Albin"
,
"Albina"
,
"Albion"
,
"Alboran"
,
"Albrecht"
,
"Albric"
,
"Albright"
,
"Albur"
,
"Alburg"
,
"Alburga"
,
"Alby"
,
"Alcina"
,
"Alcine"
,
"Alcinia"
,
"Alcock"
,
"Alcot"
,
"Alcott"
,
"Alcus"
,
"Alda"
,
"Aldarcie"
,
"Aldarcy"
,
"Aldas"
,
"Alded"
,
"Alden"
,
"Aldercy"
,
"Alderman"
,
"Alderson"
,
"Aldin"
,
"Aldis"
,
"Aldo"
,
"Aldon"
,
"Aldora"
,
"Aldos"
,
"Aldous"
,
"Aldred"
,
"Aldredge"
,
"Aldric"
,
"Aldrich"
,
"Aldridge"
,
"Alduino"
,
"Aldus"
,
"Aldwin"
,
"Aldwon"
,
"Alec"
,
"Alecia"
,
"Aleck"
,
"Aleda"
,
"Aleece"
,
"Aleedis"
,
"Aleen"
,
"Aleetha"
,
"Alegre"
,
"Alejandra"
,
"Alejandrina"
,
"Alejandro"
,
"Alejo"
,
"Alejoa"
,
"Alek"
,
"Aleksandr"
,
"Alena"
,
"Alene"
,
"Alenson"
,
"Aleras"
,
"Aleris"
,
"Aleron"
,
"Alesandrini"
,
"Alessandra"
,
"Alessandro"
,
"Aleta"
,
"Aletha"
,
"Alethea"
,
"Alethia"
,
"Aletta"
,
"Alex"
,
"Alexa"
,
"Alexander"
,
"Alexandr"
,
"Alexandra"
,
"Alexandre"
,
"Alexandria"
,
"Alexandrina"
,
"Alexandro"
,
"Alexandros"
,
"Alexei"
,
"Alexi"
,
"Alexia"
,
"Alexina"
,
"Alexine"
,
"Alexio"
,
"Alexis"
,
"Aley"
,
"Aleydis"
,
"Alf"
,
"Alfeus"
,
"Alfi"
,
"Alfie"
,
"Alfons"
,
"Alfonse"
,
"Alfonso"
,
"Alfonzo"
,
"Alford"
,
"Alfred"
,
"Alfreda"
,
"Alfredo"
,
"Alfy"
,
"Algar"
,
"Alger"
,
"Algernon"
,
"Algie"
,
"Alguire"
,
"Algy"
,
"Ali"
,
"Alia"
,
"Aliber"
,
"Alic"
,
"Alica"
,
"Alice"
,
"Alicea"
,
"Alicia"
,
"Alick"
,
"Alida"
,
"Alidia"
,
"Alidis"
,
"Alidus"
,
"Alie"
,
"Alika"
,
"Alikee"
,
"Alina"
,
"Aline"
,
"Alinna"
,
"Alis"
,
"Alisa"
,
"Alisan"
,
"Alisander"
,
"Alisen"
,
"Alisha"
,
"Alisia"
,
"Alison"
,
"Alissa"
,
"Alistair"
,
"Alister"
,
"Alisun"
,
"Alita"
,
"Alitha"
,
"Alithea"
,
"Alithia"
,
"Alitta"
,
"Alius"
,
"Alix"
,
"Aliza"
,
"Alla"
,
"Allain"
,
"Allan"
,
"Allana"
,
"Allanson"
,
"Allard"
,
"Allare"
,
"Allayne"
,
"Allbee"
,
"Allcot"
,
"Alleen"
,
"Allegra"
,
"Allen"
,
"Allene"
,
"Alleras"
,
"Allerie"
,
"Alleris"
,
"Allerus"
,
"Alley"
,
"Alleyn"
,
"Alleyne"
,
"Alli"
,
"Allianora"
,
"Alliber"
,
"Allie"
,
"Allin"
,
"Allina"
,
"Allis"
,
"Allisan"
,
"Allison"
,
"Allissa"
,
"Allista"
,
"Allister"
,
"Allistir"
,
"Allix"
,
"Allmon"
,
"Allred"
,
"Allrud"
,
"Allsopp"
,
"Allsun"
,
"Allveta"
,
"Allwein"
,
"Allx"
,
"Ally"
,
"Allyce"
,
"Allyn"
,
"Allys"
,
"Allyson"
,
"Alma"
,
"Almallah"
,
"Almeda"
,
"Almeeta"
,
"Almeida"
,
"Almena"
,
"Almeria"
,
"Almeta"
,
"Almira"
,
"Almire"
,
"Almita"
,
"Almond"
,
"Almund"
,
"Alo"
,
"Alodee"
,
"Alodi"
,
"Alodie"
,
"Aloin"
,
"Aloise"
,
"Aloisia"
,
"Aloisius"
,
"Aloke"
,
"Alon"
,
"Alonso"
,
"Alonzo"
,
"Aloysia"
,
"Aloysius"
,
"Alper"
,
"Alpers"
,
"Alpert"
,
"Alphard"
,
"Alpheus"
,
"Alphonsa"
,
"Alphonse"
,
"Alphonsine"
,
"Alphonso"
,
"AlrZc"
,
"Alric"
,
"Alrich"
,
"Alrick"
,
"Alroi"
,
"Alroy"
,
"Also"
,
"Alston"
,
"Alsworth"
,
"Alta"
,
"Altaf"
,
"Alten"
,
"Althea"
,
"Althee"
,
"Altheta"
,
"Altis"
,
"Altman"
,
"Alton"
,
"Aluin"
,
"Aluino"
,
"Alurd"
,
"Alurta"
,
"Alva"
,
"Alvan"
,
"Alvar"
,
"Alvarez"
,
"Alver"
,
"Alvera"
,
"Alverson"
,
"Alverta"
,
"Alves"
,
"Alveta"
,
"Alviani"
,
"Alvie"
,
"Alvin"
,
"Alvina"
,
"Alvinia"
,
"Alvira"
,
"Alvis"
,
"Alvita"
,
"Alvord"
,
"Alvy"
,
"Alwin"
,
"Alwitt"
,
"Alwyn"
,
"Alyce"
,
"Alyda"
,
"Alyose"
,
"Alyosha"
,
"Alys"
,
"Alysa"
,
"Alyse"
,
"Alysia"
,
"Alyson"
,
"Alysoun"
,
"Alyss"
,
"Alyssa"
,
"Alyworth"
,
"Ama"
,
"Amabel"
,
"Amabelle"
,
"Amabil"
,
"Amadas"
,
"Amadeo"
,
"Amadeus"
,
"Amadis"
,
"Amado"
,
"Amador"
,
"Amadus"
,
"Amal"
,
"Amalbena"
,
"Amalberga"
,
"Amalbergas"
,
"Amalburga"
,
"Amalea"
,
"Amalee"
,
"Amaleta"
,
"Amalia"
,
"Amalie"
,
"Amalita"
,
"Amalle"
,
"Aman"
,
"Amand"
,
"Amanda"
,
"Amandi"
,
"Amandie"
,
"Amando"
,
"Amandy"
,
"Amann"
,
"Amar"
,
"Amara"
,
"Amaral"
,
"Amaras"
,
"Amarette"
,
"Amargo"
,
"Amari"
,
"Amarillas"
,
"Amarillis"
,
"Amaris"
,
"Amary"
,
"Amaryl"
,
"Amaryllis"
,
"Amasa"
,
"Amata"
,
"Amathist"
,
"Amathiste"
,
"Amati"
,
"Amato"
,
"Amatruda"
,
"Amaty"
,
"Amber"
,
"Amberly"
,
"Ambert"
,
"Ambie"
,
"Amble"
,
"Ambler"
,
"Ambrogino"
,
"Ambrogio"
,
"Ambros"
,
"Ambrosane"
,
"Ambrose"
,
"Ambrosi"
,
"Ambrosia"
,
"Ambrosine"
,
"Ambrosio"
,
"Ambrosius"
,
"Ambur"
,
"Amby"
,
"Ame"
,
"Amedeo"
,
"Amelia"
,
"Amelie"
,
"Amelina"
,
"Ameline"
,
"Amelita"
,
"Amena"
,
"Amend"
,
"Amerigo"
,
"Amero"
,
"Amersham"
,
"Amery"
,
"Ames"
,
"Amethist"
,
"Amethyst"
,
"Ami"
,
"Amias"
,
"Amice"
,
"Amick"
,
"Amie"
,
"Amiel"
,
"Amieva"
,
"Amii"
,
"Amil"
,
"Amin"
,
"Aminta"
,
"Amir"
,
"Amitie"
,
"Amity"
,
"Amling"
,
"Ammadas"
,
"Ammadis"
,
"Ammamaria"
,
"Ammann"
,
"Ammon"
,
"Amoakuh"
,
"Amor"
,
"Amora"
,
"Amoreta"
,
"Amorete"
,
"Amorette"
,
"Amorita"
,
"Amoritta"
,
"Amory"
,
"Amos"
,
"Amr"
,
"Amrita"
,
"Amsden"
,
"Amund"
,
"Amy"
,
"Amyas"
,
"Amye"
,
"Am�lie"
,
"An"
,
"Ana"
,
"Anabal"
,
"Anabel"
,
"Anabella"
,
"Anabelle"
,
"Anagnos"
,
"Analiese"
,
"Analise"
,
"Anallese"
,
"Anallise"
,
"Anana"
,
"Ananna"
,
"Anastas"
,
"Anastase"
,
"Anastasia"
,
"Anastasie"
,
"Anastasio"
,
"Anastasius"
,
"Anastassia"
,
"Anastatius"
,
"Anastice"
,
"Anastos"
,
"Anatol"
,
"Anatola"
,
"Anatole"
,
"Anatolio"
,
"Anatollo"
,
"Ancalin"
,
"Ancel"
,
"Ancelin"
,
"Anceline"
,
"Ancell"
,
"Anchie"
,
"Ancier"
,
"Ancilin"
,
"Andee"
,
"Andeee"
,
"Andel"
,
"Ander"
,
"Anderea"
,
"Anderegg"
,
"Anderer"
,
"Anders"
,
"Andersen"
,
"Anderson"
,
"Andert"
,
"Andi"
,
"Andie"
,
"Andonis"
,
"Andra"
,
"Andrade"
,
"Andras"
,
"Andre"
,
"Andrea"
,
"Andreana"
,
"Andreas"
,
"Andree"
,
"Andrei"
,
"Andrej"
,
"Andrel"
,
"Andres"
,
"Andrew"
,
"Andrews"
,
"Andrey"
,
"Andri"
,
"Andria"
,
"Andriana"
,
"Andrien"
,
"Andriette"
,
"Andris"
,
"Andromache"
,
"Andromada"
,
"Andromeda"
,
"Andromede"
,
"Andros"
,
"Androw"
,
"Andrus"
,
"Andryc"
,
"Andy"
,
"Anestassia"
,
"Anet"
,
"Anett"
,
"Anetta"
,
"Anette"
,
"Aney"
,
"Angadreme"
,
"Angadresma"
,
"Ange"
,
"Angel"
,
"Angela"
,
"Angele"
,
"Angeli"
,
"Angelia"
,
"Angelica"
,
"Angelico"
,
"Angelika"
,
"Angelina"
,
"Angeline"
,
"Angelique"
,
"Angelis"
,
"Angelita"
,
"Angell"
,
"Angelle"
,
"Angelo"
,
"Angi"
,
"Angie"
,
"Angil"
,
"Angle"
,
"Anglim"
,
"Anglo"
,
"Angrist"
,
"Angus"
,
"Angy"
,
"Anh"
,
"Ania"
,
"Aniakudo"
,
"Anica"
,
"Aniela"
,
"Anil"
,
"Anis"
,
"Anissa"
,
"Anita"
,
"Anitra"
,
"Aniweta"
,
"Anjali"
,
"Anjanette"
,
"Anjela"
,
"Ankeny"
,
"Ankney"
,
"Ann"
,
"Ann-Marie"
,
"Anna"
,
"Anna-Diana"
,
"Anna-Diane"
,
"Anna-Maria"
,
"Annabal"
,
"Annabel"
,
"Annabela"
,
"Annabell"
,
"Annabella"
,
"Annabelle"
,
"Annadiana"
,
"Annadiane"
,
"Annalee"
,
"Annaliese"
,
"Annalise"
,
"Annamaria"
,
"Annamarie"
,
"Anne"
,
"Anne-Corinne"
,
"Anne-Marie"
,
"Annecorinne"
,
"Anneliese"
,
"Annelise"
,
"Annemarie"
,
"Annetta"
,
"Annette"
,
"Anni"
,
"Annia"
,
"Annice"
,
"Annie"
,
"Anniken"
,
"Annis"
,
"Annissa"
,
"Annmaria"
,
"Annmarie"
,
"Annnora"
,
"Annora"
,
"Annorah"
,
"Annunciata"
,
"Anny"
,
"Anora"
,
"Anse"
,
"Ansel"
,
"Ansela"
,
"Ansell"
,
"Anselm"
,
"Anselma"
,
"Anselme"
,
"Anselmi"
,
"Anselmo"
,
"Ansilma"
,
"Ansilme"
,
"Ansley"
,
"Anson"
,
"Anstice"
,
"Anstus"
,
"Antebi"
,
"Anthe"
,
"Anthea"
,
"Anthia"
,
"Anthiathia"
,
"Anthony"
,
"Antin"
,
"Antipas"
,
"Antipus"
,
"Antoine"
,
"Antoinetta"
,
"Antoinette"
,
"Anton"
,
"Antone"
,
"Antonella"
,
"Antonetta"
,
"Antoni"
,
"Antonia"
,
"Antonie"
,
"Antonietta"
,
"Antonin"
,
"Antonina"
,
"Antonino"
,
"Antonio"
,
"Antonius"
,
"Antons"
,
"Antony"
,
"Antrim"
,
"Anurag"
,
"Anuska"
,
"Any"
,
"Anya"
,
"Anyah"
,
"Anzovin"
,
"Apfel"
,
"Apfelstadt"
,
"Apgar"
,
"Aphra"
,
"Aphrodite"
,
"Apicella"
,
"Apollo"
,
"Apollus"
,
"Apostles"
,
"Appel"
,
"Apple"
,
"Appleby"
,
"Appledorf"
,
"Applegate"
,
"Appleton"
,
"Appolonia"
,
"Apps"
,
"April"
,
"Aprile"
,
"Aprilette"
,
"Apthorp"
,
"Apul"
,
"Ara"
,
"Arabeila"
,
"Arabel"
,
"Arabela"
,
"Arabele"
,
"Arabella"
,
"Arabelle"
,
"Arad"
,
"Arakawa"
,
"Araldo"
,
"Aramanta"
,
"Aramen"
,
"Aramenta"
,
"Araminta"
,
"Aran"
,
"Arand"
,
"Arathorn"
,
"Arbe"
,
"Arber"
,
"Arbuckle"
,
"Arch"
,
"Archaimbaud"
,
"Archambault"
,
"Archangel"
,
"Archer"
,
"Archibald"
,
"Archibaldo"
,
"Archibold"
,
"Archie"
,
"Archle"
,
"Archy"
,
"Ard"
,
"Arda"
,
"Ardath"
,
"Arde"
,
"Ardeen"
,
"Ardeha"
,
"Ardehs"
,
"Ardel"
,
"Ardelia"
,
"Ardelis"
,
"Ardell"
,
"Ardella"
,
"Ardelle"
,
"Arden"
,
"Ardene"
,
"Ardenia"
,
"Ardeth"
,
"Ardie"
,
"Ardin"
,
"Ardine"
,
"Ardis"
,
"Ardisj"
,
"Ardith"
,
"Ardme"
,
"Ardolino"
,
"Ardra"
,
"Ardrey"
,
"Ardussi"
,
"Ardy"
,
"Ardyce"
,
"Ardys"
,
"Ardyth"
,
"Arel"
,
"Arela"
,
"Arella"
,
"Arelus"
,
"Aret"
,
"Areta"
,
"Aretha"
,
"Aretina"
,
"Aretta"
,
"Arette"
,
"Arezzini"
,
"Argent"
,
"Argile"
,
"Argus"
,
"Argyle"
,
"Argyres"
,
"Arhna"
,
"Ari"
,
"Aria"
,
"Ariadne"
,
"Ariana"
,
"Ariane"
,
"Arianie"
,
"Arianna"
,
"Arianne"
,
"Aribold"
,
"Aric"
,
"Arica"
,
"Arick"
,
"Aridatha"
,
"Arie"
,
"Ariel"
,
"Ariela"
,
"Ariella"
,
"Arielle"
,
"Ariew"
,
"Arin"
,
"Ario"
,
"Arissa"
,
"Aristotle"
,
"Arita"
,
"Arjan"
,
"Arjun"
,
"Ark"
,
"Arlan"
,
"Arlana"
,
"Arlee"
,
"Arleen"
,
"Arlen"
,
"Arlena"
,
"Arlene"
,
"Arleta"
,
"Arlette"
,
"Arley"
,
"Arleyne"
,
"Arlie"
,
"Arliene"
,
"Arlin"
,
"Arlina"
,
"Arlinda"
,
"Arline"
,
"Arlo"
,
"Arlon"
,
"Arluene"
,
"Arly"
,
"Arlyn"
,
"Arlyne"
,
"Arlynne"
,
"Armalda"
,
"Armalla"
,
"Armallas"
,
"Arman"
,
"Armand"
,
"Armanda"
,
"Armando"
,
"Armbrecht"
,
"Armbruster"
,
"Armelda"
,
"Armil"
,
"Armilda"
,
"Armilla"
,
"Armillas"
,
"Armillda"
,
"Armillia"
,
"Armin"
,
"Armington"
,
"Armitage"
,
"Armond"
,
"Armstrong"
,
"Armyn"
,
"Arnaldo"
,
"Arnaud"
,
"Arndt"
,
"Arne"
,
"Arnelle"
,
"Arney"
,
"Arni"
,
"Arnie"
,
"Arno"
,
"Arnold"
,
"Arnoldo"
,
"Arnon"
,
"Arnst"
,
"Arnuad"
,
"Arnulfo"
,
"Arny"
,
"Arola"
,
"Aron"
,
"Arondel"
,
"Arondell"
,
"Aronoff"
,
"Aronow"
,
"Aronson"
,
"Arquit"
,
"Arratoon"
,
"Arri"
,
"Arria"
,
"Arrio"
,
"Arron"
,
"Arst"
,
"Art"
,
"Arta"
,
"Artair"
,
"Artamas"
,
"Arte"
,
"Artema"
,
"Artemas"
,
"Artemis"
,
"Artemisa"
,
"Artemisia"
,
"Artemus"
,
"Arther"
,
"Arthur"
,
"Artie"
,
"Artima"
,
"Artimas"
,
"Artina"
,
"Artur"
,
"Arturo"
,
"Artus"
,
"Arty"
,
"Aruabea"
,
"Arun"
,
"Arundel"
,
"Arundell"
,
"Arv"
,
"Arva"
,
"Arvad"
,
"Arvell"
,
"Arvid"
,
"Arvie"
,
"Arvin"
,
"Arvind"
,
"Arvo"
,
"Arvonio"
,
"Arvy"
,
"Ary"
,
"Aryn"
,
"As"
,
"Asa"
,
"Asabi"
,
"Asante"
,
"Asaph"
,
"Asare"
,
"Aschim"
,
"Ase"
,
"Asel"
,
"Ash"
,
"Asha"
,
"Ashbaugh"
,
"Ashbey"
,
"Ashby"
,
"Ashelman"
,
"Ashely"
,
"Asher"
,
"Ashford"
,
"Ashia"
,
"Ashien"
,
"Ashil"
,
"Ashjian"
,
"Ashla"
,
"Ashlan"
,
"Ashlee"
,
"Ashleigh"
,
"Ashlen"
,
"Ashley"
,
"Ashli"
,
"Ashlie"
,
"Ashlin"
,
"Ashling"
,
"Ashly"
,
"Ashman"
,
"Ashmead"
,
"Ashok"
,
"Ashraf"
,
"Ashti"
,
"Ashton"
,
"Ashwell"
,
"Ashwin"
,
"Asia"
,
"Askari"
,
"Askwith"
,
"Aslam"
,
"Asp"
,
"Aspa"
,
"Aspasia"
,
"Aspia"
,
"Asquith"
,
"Assisi"
,
"Asta"
,
"Astera"
,
"Asteria"
,
"Astor"
,
"Astra"
,
"Astraea"
,
"Astrahan"
,
"Astrea"
,
"Astred"
,
"Astri"
,
"Astrid"
,
"Astrix"
,
"Astto"
,
"Asuncion"
,
"Atal"
,
"Atalanta"
,
"Atalante"
,
"Atalanti"
,
"Atalaya"
,
"Atalayah"
,
"Atalee"
,
"Ataliah"
,
"Atalie"
,
"Atalya"
,
"Atcliffe"
,
"Athal"
,
"Athalee"
,
"Athalia"
,
"Athalie"
,
"Athalla"
,
"Athallia"
,
"Athelstan"
,
"Athena"
,
"Athene"
,
"Athenian"
,
"Athey"
,
"Athiste"
,
"Atiana"
,
"Atkins"
,
"Atkinson"
,
"Atlanta"
,
"Atlante"
,
"Atlas"
,
"Atlee"
,
"Atonsah"
,
"Atrice"
,
"Atronna"
,
"Attah"
,
"Attalanta"
,
"Attalie"
,
"Attenborough"
,
"Attenweiler"
,
"Atterbury"
,
"Atthia"
,
"Attlee"
,
"Attwood"
,
"Atul"
,
"Atwater"
,
"Atwekk"
,
"Atwood"
,
"Atworth"
,
"Au"
,
"Aubarta"
,
"Aube"
,
"Auberbach"
,
"Auberon"
,
"Aubert"
,
"Auberta"
,
"Aubigny"
,
"Aubin"
,
"Aubine"
,
"Aubree"
,
"Aubreir"
,
"Aubrette"
,
"Aubrey"
,
"Aubrie"
,
"Aubry"
,
"Auburn"
,
"Auburta"
,
"Aubyn"
,
"Audette"
,
"Audi"
,
"Audie"
,
"Audley"
,
"Audly"
,
"Audra"
,
"Audras"
,
"Audre"
,
"Audres"
,
"Audrey"
,
"Audri"
,
"Audrie"
,
"Audris"
,
"Audrit"
,
"Audry"
,
"Audrye"
,
"Audsley"
,
"Audun"
,
"Audwen"
,
"Audwin"
,
"Audy"
,
"Auerbach"
,
"Aufmann"
,
"Augie"
,
"August"
,
"Augusta"
,
"Auguste"
,
"Augustin"
,
"Augustina"
,
"Augustine"
,
"Augusto"
,
"Augustus"
,
"Augy"
,
"Aulea"
,
"Auliffe"
,
"Aun"
,
"Aundrea"
,
"Aunson"
,
"Aura"
,
"Aurea"
,
"Aurel"
,
"Aurelea"
,
"Aurelia"
,
"Aurelie"
,
"Aurelio"
,
"Aurelius"
,
"Auria"
,
"Auric"
,
"Aurie"
,
"Aurilia"
,
"Aurita"
,
"Aurlie"
,
"Auroora"
,
"Aurora"
,
"Aurore"
,
"Aurthur"
,
"Ause"
,
"Austen"
,
"Austin"
,
"Austina"
,
"Austine"
,
"Auston"
,
"Australia"
,
"Austreng"
,
"Autrey"
,
"Autry"
,
"Autum"
,
"Autumn"
,
"Auvil"
,
"Av"
,
"Ava"
,
"Avan"
,
"Avaria"
,
"Ave"
,
"Avelin"
,
"Aveline"
,
"Avera"
,
"Averell"
,
"Averi"
,
"Averil"
,
"Averill"
,
"Averir"
,
"Avery"
,
"Averyl"
,
"Avi"
,
"Avictor"
,
"Avie"
,
"Avigdor"
,
"Avilla"
,
"Avis"
,
"Avitzur"
,
"Aviv"
,
"Aviva"
,
"Avivah"
,
"Avner"
,
"Avra"
,
"Avraham"
,
"Avram"
,
"Avril"
,
"Avrit"
,
"Avrom"
,
"Avron"
,
"Avruch"
,
"Awad"
,
"Ax"
,
"Axe"
,
"Axel"
,
"Aylmar"
,
"Aylmer"
,
"Aylsworth"
,
"Aylward"
,
"Aymer"
,
"Ayn"
,
"Aynat"
,
"Ayo"
,
"Ayres"
,
"Azal"
,
"Azalea"
,
"Azaleah"
,
"Azar"
,
"Azarcon"
,
"Azaria"
,
"Azarria"
,
"Azelea"
,
"Azeria"
,
"Aziza"
,
"Azpurua"
,
"Azral"
,
"Azriel"
,
"Baal"
,
"Baalbeer"
,
"Baalman"
,
"Bab"
,
"Babara"
,
"Babb"
,
"Babbette"
,
"Babbie"
,
"Babby"
,
"Babcock"
,
"Babette"
,
"Babita"
,
"Babs"
,
"Bac"
,
"Bacchus"
,
"Bach"
,
"Bachman"
,
"Backer"
,
"Backler"
,
"Bacon"
,
"Badger"
,
"Badr"
,
"Baecher"
,
"Bael"
,
"Baelbeer"
,
"Baer"
,
"Baerl"
,
"Baerman"
,
"Baese"
,
"Bagger"
,
"Baggett"
,
"Baggott"
,
"Baggs"
,
"Bagley"
,
"Bahner"
,
"Bahr"
,
"Baiel"
,
"Bail"
,
"Bailar"
,
"Bailey"
,
"Bailie"
,
"Baillie"
,
"Baillieu"
,
"Baily"
,
"Bain"
,
"Bainbridge"
,
"Bainbrudge"
,
"Bainter"
,
"Baird"
,
"Baiss"
,
"Bajaj"
,
"Bak"
,
"Bakeman"
,
"Bakemeier"
,
"Baker"
,
"Bakerman"
,
"Bakki"
,
"Bal"
,
"Bala"
,
"Balas"
,
"Balbinder"
,
"Balbur"
,
"Balcer"
,
"Balch"
,
"Balcke"
,
"Bald"
,
"Baldridge"
,
"Balduin"
,
"Baldwin"
,
"Bale"
,
"Baler"
,
"Balf"
,
"Balfore"
,
"Balfour"
,
"Balkin"
,
"Ball"
,
"Ballard"
,
"Balliett"
,
"Balling"
,
"Ballinger"
,
"Balliol"
,
"Ballman"
,
"Ballou"
,
"Balmuth"
,
"Balough"
,
"Balsam"
,
"Balthasar"
,
"Balthazar"
,
"Bamberger"
,
"Bambi"
,
"Bambie"
,
"Bamby"
,
"Bamford"
,
"Ban"
,
"Bancroft"
,
"Bandeen"
,
"Bander"
,
"Bandler"
,
"Bandur"
,
"Banebrudge"
,
"Banerjee"
,
"Bang"
,
"Bank"
,
"Banks"
,
"Banky"
,
"Banna"
,
"Bannasch"
,
"Bannerman"
,
"Bannister"
,
"Bannon"
,
"Banquer"
,
"Banwell"
,
"Baptist"
,
"Baptista"
,
"Baptiste"
,
"Baptlsta"
,
"Bar"
,
"Bara"
,
"Barabas"
,
"Barabbas"
,
"Baram"
,
"Baras"
,
"Barayon"
,
"Barb"
,
"Barbabas"
,
"Barbabra"
,
"Barbara"
,
"Barbara-Anne"
,
"Barbaraanne"
,
"Barbarese"
,
"Barbaresi"
,
"Barbe"
,
"Barbee"
,
"Barber"
,
"Barbette"
,
"Barbey"
,
"Barbi"
,
"Barbie"
,
"Barbour"
,
"Barboza"
,
"Barbra"
,
"Barbur"
,
"Barbuto"
,
"Barby"
,
"Barcellona"
,
"Barclay"
,
"Barcot"
,
"Barcroft"
,
"Barcus"
,
"Bard"
,
"Barde"
,
"Barden"
,
"Bardo"
,
"Barfuss"
,
"Barger"
,
"Bari"
,
"Barimah"
,
"Barina"
,
"Barker"
,
"Barkley"
,
"Barling"
,
"Barlow"
,
"Barmen"
,
"Barn"
,
"Barna"
,
"Barnaba"
,
"Barnabas"
,
"Barnabe"
,
"Barnaby"
,
"Barnard"
,
"Barncard"
,
"Barnebas"
,
"Barnes"
,
"Barnet"
,
"Barnett"
,
"Barney"
,
"Barnie"
,
"Barnum"
,
"Barny"
,
"Barolet"
,
"Baron"
,
"Barr"
,
"Barra"
,
"Barrada"
,
"Barram"
,
"Barraza"
,
"Barren"
,
"Barret"
,
"Barrett"
,
"Barri"
,
"Barrie"
,
"Barrington"
,
"Barris"
,
"Barron"
,
"Barrow"
,
"Barrus"
,
"Barry"
,
"Barsky"
,
"Barstow"
,
"Bart"
,
"Barta"
,
"Bartel"
,
"Barth"
,
"Barthel"
,
"Barthelemy"
,
"Barthol"
,
"Barthold"
,
"Bartholemy"
,
"Bartholomeo"
,
"Bartholomeus"
,
"Bartholomew"
,
"Bartie"
,
"Bartko"
,
"Bartle"
,
"Bartlet"
,
"Bartlett"
,
"Bartley"
,
"Bartolemo"
,
"Bartolome"
,
"Bartolomeo"
,
"Barton"
,
"Bartosch"
,
"Bartram"
,
"Barty"
,
"Baruch"
,
"Barvick"
,
"Bary"
,
"Baryram"
,
"Bascio"
,
"Bascomb"
,
"Base"
,
"Baseler"
,
"Basham"
,
"Bashee"
,
"Bashemath"
,
"Bashemeth"
,
"Bashuk"
,
"Basia"
,
"Basil"
,
"Basile"
,
"Basilio"
,
"Basilius"
,
"Basir"
,
"Baskett"
,
"Bass"
,
"Basset"
,
"Bassett"
,
"Basso"
,
"Bast"
,
"Bastian"
,
"Bastien"
,
"Bat"
,
"Batchelor"
,
"Bate"
,
"Baten"
,
"Bates"
,
"Batha"
,
"Bathelda"
,
"Bathesda"
,
"Bathilda"
,
"Batholomew"
,
"Bathsheb"
,
"Bathsheba"
,
"Bathsheeb"
,
"Bathulda"
,
"Batish"
,
"Batista"
,
"Batory"
,
"Batruk"
,
"Batsheva"
,
"Battat"
,
"Battista"
,
"Battiste"
,
"Batty"
,
"Baudelaire"
,
"Baudin"
,
"Baudoin"
,
"Bauer"
,
"Baugh"
,
"Baum"
,
"Baumann"
,
"Baumbaugh"
,
"Baun"
,
"Bausch"
,
"Bauske"
,
"Bautista"
,
"Bautram"
,
"Bax"
,
"Baxie"
,
"Baxter"
,
"Baxy"
,
"Bay"
,
"Bayard"
,
"Bayer"
,
"Bayless"
,
"Baylor"
,
"Bayly"
,
"Baynebridge"
,
"Bazar"
,
"Bazil"
,
"Bazluke"
,
"Bea"
,
"Beach"
,
"Beacham"
,
"Beal"
,
"Beale"
,
"Beall"
,
"Bealle"
,
"Bean"
,
"Beane"
,
"Beaner"
,
"Bear"
,
"Bearce"
,
"Beard"
,
"Beare"
,
"Bearnard"
,
"Beasley"
,
"Beaston"
,
"Beata"
,
"Beatrice"
,
"Beatrisa"
,
"Beatrix"
,
"Beatriz"
,
"Beattie"
,
"Beatty"
,
"Beau"
,
"Beauchamp"
,
"Beaudoin"
,
"Beaufert"
,
"Beaufort"
,
"Beaulieu"
,
"Beaumont"
,
"Beauregard"
,
"Beauvais"
,
"Beaver"
,
"Bebe"
,
"Beberg"
,
"Becca"
,
"Bechler"
,
"Becht"
,
"Beck"
,
"Becka"
,
"Becker"
,
"Beckerman"
,
"Becket"
,
"Beckett"
,
"Becki"
,
"Beckie"
,
"Beckman"
,
"Becky"
,
"Bedad"
,
"Bedelia"
,
"Bedell"
,
"Bedwell"
,
"Bee"
,
"Beebe"
,
"Beeck"
,
"Beedon"
,
"Beekman"
,
"Beera"
,
"Beesley"
,
"Beeson"
,
"Beetner"
,
"Beffrey"
,
"Bega"
,
"Begga"
,
"Beghtol"
,
"Behah"
,
"Behka"
,
"Behl"
,
"Behlau"
,
"Behlke"
,
"Behm"
,
"Behn"
,
"Behnken"
,
"Behre"
,
"Behrens"
,
"Beichner"
,
"Beilul"
,
"Bein"
,
"Beisel"
,
"Beitch"
,
"Beitnes"
,
"Beitris"
,
"Beitz"
,
"Beka"
,
"Bekah"
,
"Bekelja"
,
"Beker"
,
"Bekha"
,
"Bekki"
,
"Bel"
,
"Bela"
,
"Belak"
,
"Belamy"
,
"Belanger"
,
"Belayneh"
,
"Belcher"
,
"Belda"
,
"Belden"
,
"Belding"
,
"Belen"
,
"Belford"
,
"Belia"
,
"Belicia"
,
"Belier"
,
"Belinda"
,
"Belita"
,
"Bell"
,
"Bella"
,
"Bellamy"
,
"Bellanca"
,
"Bellaude"
,
"Bellda"
,
"Belldame"
,
"Belldas"
,
"Belle"
,
"Beller"
,
"Bellew"
,
"Bellina"
,
"Bellis"
,
"Bello"
,
"Belloir"
,
"Belmonte"
,
"Belshin"
,
"Belsky"
,
"Belter"
,
"Beltran"
,
"Belva"
,
"Belvia"
,
"Ben"
,
"Bena"
,
"Bencion"
,
"Benco"
,
"Bender"
,
"Bendick"
,
"Bendicta"
,
"Bendicty"
,
"Bendite"
,
"Bendix"
,
"Benedetta"
,
"Benedetto"
,
"Benedic"
,
"Benedick"
,
"Benedict"
,
"Benedicta"
,
"Benedicto"
,
"Benedikt"
,
"Benedikta"
,
"Benedix"
,
"Benenson"
,
"Benetta"
,
"Benge"
,
"Bengt"
,
"Benia"
,
"Beniamino"
,
"Benil"
,
"Benilda"
,
"Benildas"
,
"Benildis"
,
"Benioff"
,
"Benis"
,
"Benisch"
,
"Benita"
,
"Benito"
,
"Benjamen"
,
"Benjamin"
,
"Benji"
,
"Benjie"
,
"Benjy"
,
"Benkley"
,
"Benn"
,
"Bennet"
,
"Bennett"
,
"Benni"
,
"Bennie"
,
"Bennink"
,
"Bennion"
,
"Bennir"
,
"Benny"
,
"Benoit"
,
"Benoite"
,
"Bensen"
,
"Bensky"
,
"Benson"
,
"Bent"
,
"Bentlee"
,
"Bentley"
,
"Bently"
,
"Benton"
,
"Benyamin"
,
"Benzel"
,
"Beora"
,
"Beore"
,
"Ber"
,
"Berard"
,
"Berardo"
,
"Berck"
,
"Berenice"
,
"Beret"
,
"Berey"
,
"Berfield"
,
"Berg"
,
"Berga"
,
"Bergeman"
,
"Bergen"
,
"Berger"
,
"Bergerac"
,
"Bergeron"
,
"Bergess"
,
"Berget"
,
"Bergh"
,
"Berghoff"
,
"Bergin"
,
"Berglund"
,
"Bergman"
,
"Bergmann"
,
"Bergmans"
,
"Bergquist"
,
"Bergren"
,
"Bergstein"
,
"Bergstrom"
,
"Bergwall"
,
"Berhley"
,
"Berk"
,
"Berke"
,
"Berkeley"
,
"Berkie"
,
"Berkin"
,
"Berkley"
,
"Berkly"
,
"Berkman"
,
"Berkow"
,
"Berkshire"
,
"Berky"
,
"Berl"
,
"Berlauda"
,
"Berlin"
,
"Berlinda"
,
"Berliner"
,
"Berlyn"
,
"Berman"
,
"Bern"
,
"Berna"
,
"Bernadene"
,
"Bernadette"
,
"Bernadina"
,
"Bernadine"
,
"Bernard"
,
"Bernardi"
,
"Bernardina"
,
"Bernardine"
,
"Bernardo"
,
"Bernarr"
,
"Bernat"
,
"Berne"
,
"Bernelle"
,
"Berner"
,
"Berners"
,
"Berneta"
,
"Bernete"
,
"Bernetta"
,
"Bernette"
,
"Bernhard"
,
"Berni"
,
"Bernice"
,
"Bernie"
,
"Bernita"
,
"Bernj"
,
"Berns"
,
"Bernstein"
,
"Bernt"
,
"Berny"
,
"Berri"
,
"Berrie"
,
"Berriman"
,
"Berry"
,
"Berstine"
,
"Bert"
,
"Berta"
,
"Bertasi"
,
"Berte"
,
"Bertelli"
,
"Bertero"
,
"Bertha"
,
"Berthe"
,
"Berthold"
,
"Berthoud"
,
"Berti"
,
"Bertie"
,
"Bertila"
,
"Bertilla"
,
"Bertina"
,
"Bertine"
,
"Bertle"
,
"Bertold"
,
"Bertolde"
,
"Berton"
,
"Bertram"
,
"Bertrand"
,
"Bertrando"
,
"Bertsche"
,
"Berty"
,
"Berwick"
,
"Beryl"
,
"Beryle"
,
"Beshore"
,
"Besnard"
,
"Bess"
,
"Besse"
,
"Bessie"
,
"Bessy"
,
"Best"
,
"Beth"
,
"Bethanne"
,
"Bethany"
,
"Bethel"
,
"Bethena"
,
"Bethesda"
,
"Bethesde"
,
"Bethezel"
,
"Bethina"
,
"Betsey"
,
"Betsy"
,
"Betta"
,
"Bette"
,
"Bette-Ann"
,
"Betteann"
,
"Betteanne"
,
"Bettencourt"
,
"Betthel"
,
"Betthezel"
,
"Betthezul"
,
"Betti"
,
"Bettina"
,
"Bettine"
,
"Betty"
,
"Bettye"
,
"Bettzel"
,
"Betz"
,
"Beulah"
,
"Beuthel"
,
"Beutler"
,
"Beutner"
,
"Bev"
,
"Bevan"
,
"Bevash"
,
"Bever"
,
"Beverie"
,
"Beverle"
,
"Beverlee"
,
"Beverley"
,
"Beverlie"
,
"Beverly"
,
"Bevers"
,
"Bevin"
,
"Bevis"
,
"Bevon"
,
"Bevus"
,
"Bevvy"
,
"Beyer"
,
"Bezanson"
,
"Bhatt"
,
"Bhayani"
,
"Biagi"
,
"Biagio"
,
"Biamonte"
,
"Bianca"
,
"Biancha"
,
"Bianchi"
,
"Bianka"
,
"Bibbie"
,
"Bibby"
,
"Bibbye"
,
"Bibeau"
,
"Bibi"
,
"Bible"
,
"Bick"
,
"Bickart"
,
"Bicknell"
,
"Biddick"
,
"Biddie"
,
"Biddle"
,
"Biddy"
,
"Bidget"
,
"Bidle"
,
"Biebel"
,
"Biegel"
,
"Bierman"
,
"Biernat"
,
"Bigelow"
,
"Bigford"
,
"Bigg"
,
"Biggs"
,
"Bigler"
,
"Bigner"
,
"Bigod"
,
"Bigot"
,
"Bik"
,
"Bikales"
,
"Bil"
,
"Bilbe"
,
"Bilek"
,
"Biles"
,
"Bili"
,
"Bilicki"
,
"Bill"
,
"Billat"
,
"Bille"
,
"Billen"
,
"Billi"
,
"Billie"
,
"Billmyre"
,
"Bills"
,
"Billy"
,
"Billye"
,
"Bilow"
,
"Bilski"
,
"Bina"
,
"Binah"
,
"Bindman"
,
"Binetta"
,
"Binette"
,
"Bing"
,
"Bink"
,
"Binky"
,
"Binni"
,
"Binnie"
,
"Binnings"
,
"Binny"
,
"Biondo"
,
"Birch"
,
"Birchard"
,
"Birck"
,
"Bird"
,
"Birdella"
,
"Birdie"
,
"Birdt"
,
"Birecree"
,
"Birgit"
,
"Birgitta"
,
"Birk"
,
"Birkett"
,
"Birkle"
,
"Birkner"
,
"Birmingham"
,
"Biron"
,
"Bish"
,
"Bishop"
,
"Bissell"
,
"Bisset"
,
"Bithia"
,
"Bittencourt"
,
"Bitthia"
,
"Bittner"
,
"Bivins"
,
"Bixby"
,
"Bixler"
,
"Bjork"
,
"Bjorn"
,
"Black"
,
"Blackburn"
,
"Blackington"
,
"Blackman"
,
"Blackmore"
,
"Blackmun"
,
"Blackstock"
,
"Blackwell"
,
"Blader"
,
"Blain"
,
"Blaine"
,
"Blainey"
,
"Blair"
,
"Blaire"
,
"Blaise"
,
"Blake"
,
"Blakelee"
,
"Blakeley"
,
"Blakely"
,
"Blalock"
,
"Blanc"
,
"Blanca"
,
"Blanch"
,
"Blancha"
,
"Blanchard"
,
"Blanche"
,
"Blanchette"
,
"Bland"
,
"Blandina"
,
"Blanding"
,
"Blane"
,
"Blank"
,
"Blanka"
,
"Blankenship"
,
"Blas"
,
"Blase"
,
"Blaseio"
,
"Blasien"
,
"Blasius"
,
"Blatman"
,
"Blatt"
,
"Blau"
,
"Blayne"
,
"Blayze"
,
"Blaze"
,
"Bledsoe"
,
"Bleier"
,
"Blen"
,
"Blessington"
,
"Blight"
,
"Blim"
,
"Blinni"
,
"Blinnie"
,
"Blinny"
,
"Bliss"
,
"Blisse"
,
"Blithe"
,
"Bloch"
,
"Block"
,
"Blockus"
,
"Blodget"
,
"Blodgett"
,
"Bloem"
,
"Blondell"
,
"Blondelle"
,
"Blondie"
,
"Blondy"
,
"Blood"
,
"Bloom"
,
"Bloomer"
,
"Blossom"
,
"Blount"
,
"Bloxberg"
,
"Bluefarb"
,
"Bluefield"
,
"Bluh"
,
"Bluhm"
,
"Blum"
,
"Bluma"
,
"Blumenfeld"
,
"Blumenthal"
,
"Blunk"
,
"Blunt"
,
"Blus"
,
"Blynn"
,
"Blythe"
,
"Bo"
,
"Boak"
,
"Boar"
,
"Boardman"
,
"Boarer"
,
"Boaten"
,
"Boatwright"
,
"Bob"
,
"Bobbe"
,
"Bobbee"
,
"Bobbette"
,
"Bobbi"
,
"Bobbie"
,
"Bobby"
,
"Bobbye"
,
"Bobette"
,
"Bobina"
,
"Bobine"
,
"Bobinette"
,
"Bobker"
,
"Bobseine"
,
"Bock"
,
"Bocock"
,
"Bodi"
,
"Bodkin"
,
"Bodnar"
,
"Bodrogi"
,
"Bodwell"
,
"Body"
,
"Boehike"
,
"Boehmer"
,
"Boeke"
,
"Boelter"
,
"Boesch"
,
"Boeschen"
,
"Boff"
,
"Boffa"
,
"Bogart"
,
"Bogey"
,
"Boggers"
,
"Boggs"
,
"Bogie"
,
"Bogoch"
,
"Bogosian"
,
"Bogusz"
,
"Bohannon"
,
"Bohaty"
,
"Bohi"
,
"Bohlen"
,
"Bohlin"
,
"Bohman"
,
"Bohner"
,
"Bohon"
,
"Bohrer"
,
"Bohs"
,
"Bohun"
,
"Boice"
,
"Boigie"
,
"Boiney"
,
"Bois"
,
"Bolan"
,
"Boland"
,
"Bolanger"
,
"Bolen"
,
"Boles"
,
"Boleslaw"
,
"Boleyn"
,
"Bolger"
,
"Bolitho"
,
"Bollay"
,
"Bollen"
,
"Bolling"
,
"Bollinger"
,
"Bolme"
,
"Bolt"
,
"Bolte"
,
"Bolten"
,
"Bolton"
,
"Bomke"
,
"Bonacci"
,
"Bonaparte"
,
"Bonar"
,
"Bond"
,
"Bondie"
,
"Bondon"
,
"Bondy"
,
"Bone"
,
"Boni"
,
"Boniface"
,
"Bonilla"
,
"Bonina"
,
"Bonine"
,
"Bonis"
,
"Bonita"
,
"Bonn"
,
"Bonne"
,
"Bonneau"
,
"Bonnee"
,
"Bonnell"
,
"Bonner"
,
"Bonnes"
,
"Bonnette"
,
"Bonney"
,
"Bonni"
,
"Bonnibelle"
,
"Bonnice"
,
"Bonnie"
,
"Bonns"
,
"Bonny"
,
"Bonucci"
,
"Booker"
,
"Booma"
,
"Boone"
,
"Boonie"
,
"Boony"
,
"Boor"
,
"Boorer"
,
"Boorman"
,
"Boot"
,
"Boote"
,
"Booth"
,
"Boothe"
,
"Boothman"
,
"Booze"
,
"Bopp"
,
"Bor"
,
"Bora"
,
"Borchers"
,
"Borchert"
,
"Bord"
,
"Borden"
,
"Bordie"
,
"Bordiuk"
,
"Bordy"
,
"Bore"
,
"Borek"
,
"Borer"
,
"Bores"
,
"Borg"
,
"Borgeson"
,
"Boris"
,
"Bork"
,
"Borlase"
,
"Borlow"
,
"Borman"
,
"Born"
,
"Bornie"
,
"Bornstein"
,
"Borras"
,
"Borrell"
,
"Borreri"
,
"Borries"
,
"Borroff"
,
"Borszcz"
,
"Bortman"
,
"Bortz"
,
"Boru"
,
"Bosch"
,
"Bose"
,
"Boser"
,
"Bosson"
,
"Bostow"
,
"Boswall"
,
"Boswell"
,
"Botnick"
,
"Botsford"
,
"Bottali"
,
"Botti"
,
"Botzow"
,
"Bouchard"
,
"Boucher"
,
"Bouchier"
,
"Boudreaux"
,
"Bough"
,
"Boulanger"
,
"Bouldon"
,
"Bouley"
,
"Bound"
,
"Bounds"
,
"Bourgeois"
,
"Bourke"
,
"Bourn"
,
"Bourne"
,
"Bourque"
,
"Boutis"
,
"Bouton"
,
"Bouzoun"
,
"Bove"
,
"Bovill"
,
"Bow"
,
"Bowden"
,
"Bowe"
,
"Bowen"
,
"Bower"
,
"Bowerman"
,
"Bowers"
,
"Bowes"
,
"Bowie"
,
"Bowlds"
,
"Bowler"
,
"Bowles"
,
"Bowman"
,
"Bowne"
,
"Bowra"
,
"Bowrah"
,
"Bowyer"
,
"Box"
,
"Boy"
,
"Boyce"
,
"Boycey"
,
"Boycie"
,
"Boyd"
,
"Boyden"
,
"Boyer"
,
"Boyes"
,
"Boykins"
,
"Boylan"
,
"Boylston"
,
"Boynton"
,
"Boys"
,
"Boyse"
,
"Boyt"
,
"Bozovich"
,
"Bozuwa"
,
"Braasch"
,
"Brabazon"
,
"Braca"
,
"Bracci"
,
"Brace"
,
"Brackely"
,
"Brackett"
,
"Brad"
,
"Bradan"
,
"Brade"
,
"Braden"
,
"Bradeord"
,
"Brader"
,
"Bradford"
,
"Bradlee"
,
"Bradleigh"
,
"Bradley"
,
"Bradly"
,
"Bradman"
,
"Bradney"
,
"Bradshaw"
,
"Bradski"
,
"Bradstreet"
,
"Bradway"
,
"Bradwell"
,
"Brady"
,
"Braeunig"
,
"Brag"
,
"Brahear"
,
"Brainard"
,
"Bram"
,
"Bramwell"
,
"Bran"
,
"Brana"
,
"Branca"
,
"Branch"
,
"Brand"
,
"Brandais"
,
"Brande"
,
"Brandea"
,
"Branden"
,
"Brandenburg"
,
"Brander"
,
"Brandes"
,
"Brandi"
,
"Brandice"
,
"Brandie"
,
"Brandise"
,
"Brandon"
,
"Brandt"
,
"Brandtr"
,
"Brandwein"
,
"Brandy"
,
"Brandyn"
,
"Branen"
,
"Branham"
,
"Brannon"
,
"Branscum"
,
"Brant"
,
"Brantley"
,
"Brasca"
,
"Brass"
,
"Braswell"
,
"Brathwaite"
,
"Bratton"
,
"Braun"
,
"Braunstein"
,
"Brause"
,
"Bravar"
,
"Bravin"
,
"Brawley"
,
"Brawner"
,
"Bray"
,
"Braynard"
,
"Brazee"
,
"Breana"
,
"Breanne"
,
"Brear"
,
"Breban"
,
"Brebner"
,
"Brecher"
,
"Brechtel"
,
"Bred"
,
"Bree"
,
"Breech"
,
"Breed"
,
"Breen"
,
"Breena"
,
"Breeze"
,
"Breger"
,
"Brelje"
,
"Bremble"
,
"Bremen"
,
"Bremer"
,
"Bremser"
,
"Bren"
,
"Brena"
,
"Brenan"
,
"Brenda"
,
"Brendan"
,
"Brenden"
,
"Brendin"
,
"Brendis"
,
"Brendon"
,
"Brenk"
,
"Brenn"
,
"Brenna"
,
"Brennan"
,
"Brennen"
,
"Brenner"
,
"Brent"
,
"Brenton"
,
"Brentt"
,
"Brenza"
,
"Bresee"
,
"Breskin"
,
"Brest"
,
"Bret"
,
"Brett"
,
"Brew"
,
"Brewer"
,
"Brewster"
,
"Brey"
,
"Brezin"
,
"Bria"
,
"Brian"
,
"Briana"
,
"Brianna"
,
"Brianne"
,
"Briano"
,
"Briant"
,
"Brice"
,
"Brick"
,
"Bricker"
,
"Bride"
,
"Bridge"
,
"Bridges"
,
"Bridget"
,
"Bridgette"
,
"Bridgid"
,
"Bridie"
,
"Bridwell"
,
"Brie"
,
"Brien"
,
"Brier"
,
"Brieta"
,
"Brietta"
,
"Brig"
,
"Brigette"
,
"Brigg"
,
"Briggs"
,
"Brigham"
,
"Bright"
,
"Brightman"
,
"Brighton"
,
"Brigid"
,
"Brigida"
,
"Brigit"
,
"Brigitta"
,
"Brigitte"
,
"Brill"
,
"Brina"
,
"Brindell"
,
"Brindle"
,
"Brine"
,
"Briney"
,
"Bringhurst"
,
"Brink"
,
"Brinkema"
,
"Brinn"
,
"Brinna"
,
"Brinson"
,
"Briny"
,
"Brion"
,
"Briscoe"
,
"Bristow"
,
"Brit"
,
"Brita"
,
"Britney"
,
"Britni"
,
"Britt"
,
"Britta"
,
"Brittain"
,
"Brittan"
,
"Brittaney"
,
"Brittani"
,
"Brittany"
,
"Britte"
,
"Britteny"
,
"Brittne"
,
"Brittnee"
,
"Brittney"
,
"Brittni"
,
"Britton"
,
"Brnaba"
,
"Brnaby"
,
"Broadbent"
,
"Brock"
,
"Brockie"
,
"Brocklin"
,
"Brockwell"
,
"Brocky"
,
"Brod"
,
"Broddie"
,
"Broddy"
,
"Brodench"
,
"Broder"
,
"Broderic"
,
"Broderick"
,
"Brodeur"
,
"Brodie"
,
"Brodsky"
,
"Brody"
,
"Broeder"
,
"Broek"
,
"Broeker"
,
"Brogle"
,
"Broida"
,
"Brok"
,
"Brom"
,
"Bromleigh"
,
"Bromley"
,
"Bron"
,
"Bronder"
,
"Bronez"
,
"Bronk"
,
"Bronnie"
,
"Bronny"
,
"Bronson"
,
"Bronwen"
,
"Bronwyn"
,
"Brook"
,
"Brooke"
,
"Brookes"
,
"Brookhouse"
,
"Brooking"
,
"Brookner"
,
"Brooks"
,
"Broome"
,
"Brose"
,
"Brosine"
,
"Brost"
,
"Brosy"
,
"Brote"
,
"Brothers"
,
"Brotherson"
,
"Brott"
,
"Brottman"
,
"Broucek"
,
"Brout"
,
"Brouwer"
,
"Brower"
,
"Brown"
,
"Browne"
,
"Browning"
,
"Brownley"
,
"Brownson"
,
"Brozak"
,
"Brubaker"
,
"Bruce"
,
"Brucie"
,
"Bruckner"
,
"Bruell"
,
"Brufsky"
,
"Bruis"
,
"Brunell"
,
"Brunella"
,
"Brunelle"
,
"Bruner"
,
"Brunhild"
,
"Brunhilda"
,
"Brunhilde"
,
"Bruni"
,
"Bruning"
,
"Brunk"
,
"Brunn"
,
"Bruno"
,
"Bruns"
,
"Bruyn"
,
"Bryan"
,
"Bryana"
,
"Bryant"
,
"Bryanty"
,
"Bryce"
,
"Bryn"
,
"Bryna"
,
"Bryner"
,
"Brynn"
,
"Brynna"
,
"Brynne"
,
"Bryon"
,
"Buatti"
,
"Bubalo"
,
"Bubb"
,
"Bucella"
,
"Buchalter"
,
"Buchanan"
,
"Buchbinder"
,
"Bucher"
,
"Buchheim"
,
"Buck"
,
"Buckden"
,
"Buckels"
,
"Buckie"
,
"Buckingham"
,
"Buckler"
,
"Buckley"
,
"Bucky"
,
"Bud"
,
"Budd"
,
"Budde"
,
"Buddie"
,
"Budding"
,
"Buddy"
,
"Buderus"
,
"Budge"
,
"Budwig"
,
"Budworth"
,
"Buehler"
,
"Buehrer"
,
"Buell"
,
"Buerger"
,
"Bueschel"
,
"Buff"
,
"Buffo"
,
"Buffum"
,
"Buffy"
,
"Buford"
,
"Bugbee"
,
"Buhler"
,
"Bui"
,
"Buine"
,
"Buiron"
,
"Buke"
,
"Bull"
,
"Bullard"
,
"Bullen"
,
"Buller"
,
"Bulley"
,
"Bullion"
,
"Bullis"
,
"Bullivant"
,
"Bullock"
,
"Bullough"
,
"Bully"
,
"Bultman"
,
"Bum"
,
"Bumgardner"
,
"Buna"
,
"Bunce"
,
"Bunch"
,
"Bunde"
,
"Bunder"
,
"Bundy"
,
"Bunker"
,
"Bunni"
,
"Bunnie"
,
"Bunns"
,
"Bunny"
,
"Bunow"
,
"Bunting"
,
"Buonomo"
,
"Buote"
,
"Burack"
,
"Burbank"
,
"Burch"
,
"Burchett"
,
"Burck"
,
"Burd"
,
"Burdelle"
,
"Burdett"
,
"Burford"
,
"Burg"
,
"Burgener"
,
"Burger"
,
"Burgess"
,
"Burget"
,
"Burgwell"
,
"Burhans"
,
"Burk"
,
"Burke"
,
"Burkhard"
,
"Burkhardt"
,
"Burkhart"
,
"Burkitt"
,
"Burkle"
,
"Burkley"
,
"Burl"
,
"Burleigh"
,
"Burley"
,
"Burlie"
,
"Burman"
,
"Burn"
,
"Burnaby"
,
"Burnard"
,
"Burne"
,
"Burner"
,
"Burnett"
,
"Burney"
,
"Burnham"
,
"Burnie"
,
"Burnight"
,
"Burnley"
,
"Burns"
,
"Burnsed"
,
"Burnside"
,
"Burny"
,
"Buroker"
,
"Burr"
,
"Burra"
,
"Burrell"
,
"Burrill"
,
"Burris"
,
"Burroughs"
,
"Burrow"
,
"Burrows"
,
"Burrton"
,
"Burrus"
,
"Burt"
,
"Burta"
,
"Burtie"
,
"Burtis"
,
"Burton"
,
"Burty"
,
"Burwell"
,
"Bury"
,
"Busby"
,
"Busch"
,
"Buschi"
,
"Buseck"
,
"Busey"
,
"Bush"
,
"Bushey"
,
"Bushore"
,
"Bushweller"
,
"Busiek"
,
"Buskirk"
,
"Buskus"
,
"Bussey"
,
"Bussy"
,
"Bust"
,
"Butch"
,
"Butcher"
,
"Butler"
,
"Butta"
,
"Buttaro"
,
"Butte"
,
"Butterfield"
,
"Butterworth"
,
"Button"
,
"Buxton"
,
"Buyer"
,
"Buyers"
,
"Buyse"
,
"Buzz"
,
"Buzzell"
,
"Byers"
,
"Byler"
,
"Byram"
,
"Byran"
,
"Byrann"
,
"Byrd"
,
"Byrdie"
,
"Byrle"
,
"Byrn"
,
"Byrne"
,
"Byrom"
,
"Byron"
,
"Bysshe"
,
"Bywaters"
,
"Bywoods"
,
"Cacia"
,
"Cacie"
,
"Cacilia"
,
"Cacilie"
,
"Cacka"
,
"Cad"
,
"Cadal"
,
"Caddaric"
,
"Caddric"
,
"Cade"
,
"Cadel"
,
"Cadell"
,
"Cadman"
,
"Cadmann"
,
"Cadmar"
,
"Cadmarr"
,
"Caesar"
,
"Caesaria"
,
"Caffrey"
,
"Cagle"
,
"Cahan"
,
"Cahilly"
,
"Cahn"
,
"Cahra"
,
"Cai"
,
"Caia"
,
"Caiaphas"
,
"Cailean"
,
"Cailly"
,
"Cain"
,
"Caine"
,
"Caines"
,
"Cairistiona"
,
"Cairns"
,
"Caitlin"
,
"Caitrin"
,
"Cal"
,
"Calabrese"
,
"Calabresi"
,
"Calan"
,
"Calandra"
,
"Calandria"
,
"Calbert"
,
"Caldeira"
,
"Calder"
,
"Caldera"
,
"Calderon"
,
"Caldwell"
,
"Cale"
,
"Caleb"
,
"Calen"
,
"Calendra"
,
"Calendre"
,
"Calesta"
,
"Calhoun"
,
"Calia"
,
"Calica"
,
"Calida"
,
"Calie"
,
"Calisa"
,
"Calise"
,
"Calista"
,
"Call"
,
"Calla"
,
"Callahan"
,
"Callan"
,
"Callas"
,
"Calle"
,
"Callean"
,
"Callery"
,
"Calley"
,
"Calli"
,
"Callida"
,
"Callie"
,
"Callista"
,
"Calloway"
,
"Callum"
,
"Cally"
,
"Calmas"
,
"Calondra"
,
"Calore"
,
"Calv"
,
"Calva"
,
"Calvano"
,
"Calvert"
,
"Calvin"
,
"Calvina"
,
"Calvinna"
,
"Calvo"
,
"Calypso"
,
"Calysta"
,
"Cam"
,
"Camala"
,
"Camarata"
,
"Camden"
,
"Camel"
,
"Camella"
,
"Camellia"
,
"Cameron"
,
"Camey"
,
"Camfort"
,
"Cami"
,
"Camila"
,
"Camile"
,
"Camilia"
,
"Camilla"
,
"Camille"
,
"Camilo"
,
"Camm"
,
"Cammi"
,
"Cammie"
,
"Cammy"
,
"Camp"
,
"Campagna"
,
"Campball"
,
"Campbell"
,
"Campman"
,
"Campney"
,
"Campos"
,
"Campy"
,
"Camus"
,
"Can"
,
"Canada"
,
"Canale"
,
"Cand"
,
"Candace"
,
"Candi"
,
"Candice"
,
"Candida"
,
"Candide"
,
"Candie"
,
"Candis"
,
"Candless"
,
"Candra"
,
"Candy"
,
"Candyce"
,
"Caneghem"
,
"Canfield"
,
"Canica"
,
"Canice"
,
"Caniff"
,
"Cann"
,
"Cannell"
,
"Cannice"
,
"Canning"
,
"Cannon"
,
"Canon"
,
"Canotas"
,
"Canter"
,
"Cantlon"
,
"Cantone"
,
"Cantu"
,
"Canty"
,
"Canute"
,
"Capello"
,
"Caplan"
,
"Capon"
,
"Capone"
,
"Capp"
,
"Cappella"
,
"Cappello"
,
"Capps"
,
"Caprice"
,
"Capriola"
,
"Caputo"
,
"Caputto"
,
"Capwell"
,
"Car"
,
"Cara"
,
"Caralie"
,
"Caras"
,
"Caravette"
,
"Caraviello"
,
"Carberry"
,
"Carbo"
,
"Carbone"
,
"Carboni"
,
"Carbrey"
,
"Carce"
,
"Card"
,
"Carder"
,
"Cardew"
,
"Cardie"
,
"Cardinal"
,
"Cardon"
,
"Cardwell"
,
"Care"
,
"Careaga"
,
"Caren"
,
"Carena"
,
"Caresa"
,
"Caressa"
,
"Caresse"
,
"Carew"
,
"Carey"
,
"Cargian"
,
"Carhart"
,
"Cari"
,
"Caria"
,
"Carie"
,
"Caril"
,
"Carilla"
,
"Carilyn"
,
"Carin"
,
"Carina"
,
"Carine"
,
"Cariotta"
,
"Carisa"
,
"Carissa"
,
"Carita"
,
"Caritta"
,
"Carl"
,
"Carla"
,
"Carlee"
,
"Carleen"
,
"Carlen"
,
"Carlene"
,
"Carleton"
,
"Carley"
,
"Carli"
,
"Carlick"
,
"Carlie"
,
"Carlile"
,
"Carlin"
,
"Carlina"
,
"Carline"
,
"Carling"
,
"Carlisle"
,
"Carlita"
,
"Carlo"
,
"Carlock"
,
"Carlos"
,
"Carlota"
,
"Carlotta"
,
"Carlson"
,
"Carlstrom"
,
"Carlton"
,
"Carly"
,
"Carlye"
,
"Carlyle"
,
"Carlyn"
,
"Carlynn"
,
"Carlynne"
,
"Carma"
,
"Carman"
,
"Carmel"
,
"Carmela"
,
"Carmelia"
,
"Carmelina"
,
"Carmelita"
,
"Carmella"
,
"Carmelle"
,
"Carmelo"
,
"Carmen"
,
"Carmena"
,
"Carmencita"
,
"Carmina"
,
"Carmine"
,
"Carmita"
,
"Carmon"
,
"Carn"
,
"Carnahan"
,
"Carnay"
,
"Carnes"
,
"Carney"
,
"Carny"
,
"Caro"
,
"Carol"
,
"Carol-Jean"
,
"Carola"
,
"Carolan"
,
"Carolann"
,
"Carole"
,
"Carolee"
,
"Carolin"
,
"Carolina"
,
"Caroline"
,
"Carolle"
,
"Carolus"
,
"Carolyn"
,
"Carolyne"
,
"Carolynn"
,
"Carolynne"
,
"Caron"
,
"Carothers"
,
"Carpenter"
,
"Carper"
,
"Carpet"
,
"Carpio"
,
"Carr"
,
"Carree"
,
"Carrel"
,
"Carrelli"
,
"Carrew"
,
"Carri"
,
"Carrick"
,
"Carrie"
,
"Carrillo"
,
"Carrington"
,
"Carrissa"
,
"Carrnan"
,
"Carrol"
,
"Carroll"
,
"Carry"
,
"Carson"
,
"Cart"
,
"Cartan"
,
"Carter"
,
"Carthy"
,
"Cartie"
,
"Cartwell"
,
"Cartwright"
,
"Caruso"
,
"Carver"
,
"Carvey"
,
"Cary"
,
"Caryl"
,
"Caryn"
,
"Cas"
,
"Casabonne"
,
"Casady"
,
"Casaleggio"
,
"Casandra"
,
"Casanova"
,
"Casar"
,
"Casavant"
,
"Case"
,
"Casey"
,
"Cash"
,
"Casi"
,
"Casia"
,
"Casie"
,
"Casilda"
,
"Casilde"
,
"Casimir"
,
"Casimire"
,
"Casmey"
,
"Caspar"
,
"Casper"
,
"Cass"
,
"Cassady"
,
"Cassandra"
,
"Cassandre"
,
"Cassandry"
,
"Cassaundra"
,
"Cassell"
,
"Cassella"
,
"Cassey"
,
"Cassi"
,
"Cassiani"
,
"Cassidy"
,
"Cassie"
,
"Cassil"
,
"Cassilda"
,
"Cassius"
,
"Cassondra"
,
"Cassy"
,
"Casta"
,
"Castara"
,
"Casteel"
,
"Castera"
,
"Castillo"
,
"Castle"
,
"Castor"
,
"Castora"
,
"Castorina"
,
"Castra"
,
"Castro"
,
"Caswell"
,
"Cataldo"
,
"Catarina"
,
"Cate"
,
"Caterina"
,
"Cates"
,
"Cath"
,
"Catha"
,
"Catharina"
,
"Catharine"
,
"Cathe"
,
"Cathee"
,
"Catherin"
,
"Catherina"
,
"Catherine"
,
"Cathey"
,
"Cathi"
,
"Cathie"
,
"Cathleen"
,
"Cathlene"
,
"Cathrin"
,
"Cathrine"
,
"Cathryn"
,
"Cathy"
,
"Cathyleen"
,
"Cati"
,
"Catie"
,
"Catima"
,
"Catina"
,
"Catlaina"
,
"Catlee"
,
"Catlin"
,
"Cato"
,
"Caton"
,
"Catrina"
,
"Catriona"
,
"Catt"
,
"Cattan"
,
"Cattier"
,
"Cattima"
,
"Catto"
,
"Catton"
,
"Caty"
,
"Caughey"
,
"Caundra"
,
"Cavallaro"
,
"Cavan"
,
"Cavanagh"
,
"Cavanaugh"
,
"Cave"
,
"Caves"
,
"Cavil"
,
"Cavill"
,
"Cavit"
,
"Cavuoto"
,
"Cawley"
,
"Caye"
,
"Cayla"
,
"Caylor"
,
"Cayser"
,
"Caz"
,
"Cazzie"
,
"Cchaddie"
,
"Cece"
,
"Cecelia"
,
"Cecil"
,
"Cecile"
,
"Ceciley"
,
"Cecilia"
,
"Cecilio"
,
"Cecilius"
,
"Cecilla"
,
"Cecily"
,
"Ced"
,
"Cedar"
,
"Cedell"
,
"Cedric"
,
"Ceevah"
,
"Ceil"
,
"Cele"
,
"Celene"
,
"Celeski"
,
"Celesta"
,
"Celeste"
,
"Celestia"
,
"Celestina"
,
"Celestine"
,
"Celestyn"
,
"Celestyna"
,
"Celia"
,
"Celie"
,
"Celik"
,
"Celin"
,
"Celina"
,
"Celinda"
,
"Celine"
,
"Celinka"
,
"Celio"
,
"Celisse"
,
"Celka"
,
"Celle"
,
"Cello"
,
"Celtic"
,
"Cenac"
,
"Cence"
,
"Centeno"
,
"Center"
,
"Centonze"
,
"Ceporah"
,
"Cerallua"
,
"Cerelia"
,
"Cerell"
,
"Cerellia"
,
"Cerelly"
,
"Cerf"
,
"Cerracchio"
,
"Certie"
,
"Cerveny"
,
"Cerys"
,
"Cesar"
,
"Cesare"
,
"Cesaria"
,
"Cesaro"
,
"Cestar"
,
"Cesya"
,
"Cha"
,
"Chabot"
,
"Chace"
,
"Chad"
,
"Chadabe"
,
"Chadbourne"
,
"Chadburn"
,
"Chadd"
,
"Chaddie"
,
"Chaddy"
,
"Chader"
,
"Chadwick"
,
"Chae"
,
"Chafee"
,
"Chaffee"
,
"Chaffin"
,
"Chaffinch"
,
"Chaiken"
,
"Chaille"
,
"Chaim"
,
"Chainey"
,
"Chaing"
,
"Chak"
,
"Chaker"
,
"Chally"
,
"Chalmer"
,
"Chalmers"
,
"Chamberlain"
,
"Chamberlin"
,
"Chambers"
,
"Chamkis"
,
"Champ"
,
"Champagne"
,
"Champaigne"
,
"Chan"
,
"Chance"
,
"Chancellor"
,
"Chancelor"
,
"Chancey"
,
"Chanda"
,
"Chandal"
,
"Chandler"
,
"Chandless"
,
"Chandos"
,
"Chandra"
,
"Chane"
,
"Chaney"
,
"Chang"
,
"Changaris"
,
"Channa"
,
"Channing"
,
"Chansoo"
,
"Chantal"
,
"Chantalle"
,
"Chao"
,
"Chap"
,
"Chapa"
,
"Chapel"
,
"Chapell"
,
"Chapen"
,
"Chapin"
,
"Chapland"
,
"Chapman"
,
"Chapnick"
,
"Chappelka"
,
"Chappell"
,
"Chappie"
,
"Chappy"
,
"Chara"
,
"Charbonneau"
,
"Charbonnier"
,
"Chard"
,
"Chari"
,
"Charie"
,
"Charil"
,
"Charin"
,
"Chariot"
,
"Charis"
,
"Charissa"
,
"Charisse"
,
"Charita"
,
"Charity"
,
"Charla"
,
"Charlean"
,
"Charleen"
,
"Charlena"
,
"Charlene"
,
"Charles"
,
"Charlet"
,
"Charleton"
,
"Charley"
,
"Charlie"
,
"Charline"
,
"Charlot"
,
"Charlotta"
,
"Charlotte"
,
"Charlton"
,
"Charmain"
,
"Charmaine"
,
"Charmane"
,
"Charmian"
,
"Charmine"
,
"Charmion"
,
"Charo"
,
"Charpentier"
,
"Charron"
,
"Charry"
,
"Charteris"
,
"Charters"
,
"Charyl"
,
"Chas"
,
"Chase"
,
"Chasse"
,
"Chassin"
,
"Chastain"
,
"Chastity"
,
"Chatav"
,
"Chatterjee"
,
"Chatwin"
,
"Chaudoin"
,
"Chaunce"
,
"Chauncey"
,
"Chavaree"
,
"Chaves"
,
"Chavey"
,
"Chavez"
,
"Chaworth"
,
"Che"
,
"Cheadle"
,
"Cheatham"
,
"Checani"
,
"Chee"
,
"Cheffetz"
,
"Cheke"
,
"Chellman"
,
"Chelsae"
,
"Chelsea"
,
"Chelsey"
,
"Chelsie"
,
"Chelsy"
,
"Chelton"
,
"Chem"
,
"Chema"
,
"Chemar"
,
"Chemaram"
,
"Chemarin"
,
"Chemash"
,
"Chemesh"
,
"Chemosh"
,
"Chemush"
,
"Chen"
,
"Chenay"
,
"Chenee"
,
"Cheney"
,
"Cheng"
,
"Cher"
,
"Chere"
,
"Cherey"
,
"Cheri"
,
"Cheria"
,
"Cherian"
,
"Cherianne"
,
"Cherice"
,
"Cherida"
,
"Cherie"
,
"Cherilyn"
,
"Cherilynn"
,
"Cherin"
,
"Cherise"
,
"Cherish"
,
"Cherlyn"
,
"Chernow"
,
"Cherri"
,
"Cherrita"
,
"Cherry"
,
"Chery"
,
"Cherye"
,
"Cheryl"
,
"Ches"
,
"Cheshire"
,
"Cheslie"
,
"Chesna"
,
"Chesney"
,
"Chesnut"
,
"Chessa"
,
"Chessy"
,
"Chester"
,
"Cheston"
,
"Chet"
,
"Cheung"
,
"Chev"
,
"Chevalier"
,
"Chevy"
,
"Chew"
,
"Cheyne"
,
"Cheyney"
,
"Chi"
,
"Chiaki"
,
"Chiang"
,
"Chiarra"
,
"Chic"
,
"Chick"
,
"Chickie"
,
"Chicky"
,
"Chico"
,
"Chicoine"
,
"Chien"
,
"Chil"
,
"Chilcote"
,
"Child"
,
"Childers"
,
"Childs"
,
"Chiles"
,
"Chill"
,
"Chilson"
,
"Chilt"
,
"Chilton"
,
"Chimene"
,
"Chin"
,
"China"
,
"Ching"
,
"Chinua"
,
"Chiou"
,
"Chip"
,
"Chipman"
,
"Chiquia"
,
"Chiquita"
,
"Chirlin"
,
"Chisholm"
,
"Chita"
,
"Chitkara"
,
"Chivers"
,
"Chladek"
,
"Chlo"
,
"Chloe"
,
"Chloette"
,
"Chloras"
,
"Chlores"
,
"Chlori"
,
"Chloris"
,
"Cho"
,
"Chobot"
,
"Chon"
,
"Chong"
,
"Choo"
,
"Choong"
,
"Chor"
,
"Chouest"
,
"Chow"
,
"Chretien"
,
"Chris"
,
"Chrisman"
,
"Chrisoula"
,
"Chrissa"
,
"Chrisse"
,
"Chrissie"
,
"Chrissy"
,
"Christa"
,
"Christabel"
,
"Christabella"
,
"Christabelle"
,
"Christal"
,
"Christalle"
,
"Christan"
,
"Christean"
,
"Christel"
,
"Christen"
,
"Christensen"
,
"Christenson"
,
"Christi"
,
"Christian"
,
"Christiana"
,
"Christiane"
,
"Christianity"
,
"Christianna"
,
"Christiano"
,
"Christiansen"
,
"Christianson"
,
"Christie"
,
"Christin"
,
"Christina"
,
"Christine"
,
"Christis"
,
"Christmann"
,
"Christmas"
,
"Christoffer"
,
"Christoforo"
,
"Christoper"
,
"Christoph"
,
"Christophe"
,
"Christopher"
,
"Christos"
,
"Christy"
,
"Christye"
,
"Christyna"
,
"Chrisy"
,
"Chrotoem"
,
"Chrysa"
,
"Chrysler"
,
"Chrystal"
,
"Chryste"
,
"Chrystel"
,
"Chu"
,
"Chuah"
,
"Chubb"
,
"Chuch"
,
"Chucho"
,
"Chuck"
,
"Chud"
,
"Chui"
,
"Chuipek"
,
"Chun"
,
"Chung"
,
"Chura"
,
"Church"
,
"Churchill"
,
"Chute"
,
"Chuu"
,
"Chyou"
,
"Cia"
,
"Cianca"
,
"Ciapas"
,
"Ciapha"
,
"Ciaphus"
,
"Cibis"
,
"Ciccia"
,
"Cicely"
,
"Cicenia"
,
"Cicero"
,
"Cichocki"
,
"Cicily"
,
"Cid"
,
"Cida"
,
"Ciel"
,
"Cila"
,
"Cilka"
,
"Cilla"
,
"Cilo"
,
"Cilurzo"
,
"Cima"
,
"Cimah"
,
"Cimbura"
,
"Cinda"
,
"Cindee"
,
"Cindelyn"
,
"Cinderella"
,
"Cindi"
,
"Cindie"
,
"Cindra"
,
"Cindy"
,
"Cinelli"
,
"Cini"
,
"Cinnamon"
,
"Cioban"
,
"Cioffred"
,
"Ciprian"
,
"Circosta"
,
"Ciri"
,
"Cirilla"
,
"Cirillo"
,
"Cirilo"
,
"Ciro"
,
"Cirone"
,
"Cirri"
,
"Cis"
,
"Cissie"
,
"Cissiee"
,
"Cissy"
,
"Cita"
,
"Citarella"
,
"Citron"
,
"Clabo"
,
"Claiborn"
,
"Claiborne"
,
"Clair"
,
"Claire"
,
"Claman"
,
"Clance"
,
"Clancy"
,
"Clapp"
,
"Clapper"
,
"Clara"
,
"Clarabelle"
,
"Clarance"
,
"Clardy"
,
"Clare"
,
"Clarence"
,
"Claresta"
,
"Clareta"
,
"Claretta"
,
"Clarette"
,
"Clarey"
,
"Clarhe"
,
"Clari"
,
"Claribel"
,
"Clarice"
,
"Clarie"
,
"Clarinda"
,
"Clarine"
,
"Clarisa"
,
"Clarise"
,
"Clarissa"
,
"Clarisse"
,
"Clarita"
,
"Clark"
,
"Clarke"
,
"Clarkin"
,
"Clarkson"
,
"Clary"
,
"Claud"
,
"Clauddetta"
,
"Claude"
,
"Claudell"
,
"Claudelle"
,
"Claudetta"
,
"Claudette"
,
"Claudia"
,
"Claudian"
,
"Claudianus"
,
"Claudie"
,
"Claudina"
,
"Claudine"
,
"Claudio"
,
"Claudius"
,
"Claudy"
,
"Claus"
,
"Clausen"
,
"Clava"
,
"Clawson"
,
"Clay"
,
"Clayberg"
,
"Clayborn"
,
"Clayborne"
,
"Claybourne"
,
"Clayson"
,
"Clayton"
,
"Clea"
,
"Cleary"
,
"Cleasta"
,
"Cleave"
,
"Cleaves"
,
"Cleavland"
,
"Clein"
,
"Cleland"
,
"Clellan"
,
"Clem"
,
"Clemen"
,
"Clemence"
,
"Clemens"
,
"Clement"
,
"Clementas"
,
"Clemente"
,
"Clementi"
,
"Clementia"
,
"Clementina"
,
"Clementine"
,
"Clementis"
,
"Clementius"
,
"Clements"
,
"Clemmie"
,
"Clemmy"
,
"Cleo"
,
"Cleodal"
,
"Cleodel"
,
"Cleodell"
,
"Cleon"
,
"Cleopatra"
,
"Cleopatre"
,
"Clerc"
,
"Clercq"
,
"Clere"
,
"Cleres"
,
"Clerissa"
,
"Clerk"
,
"Cleti"
,
"Cletis"
,
"Cletus"
,
"Cleve"
,
"Cleveland"
,
"Clevey"
,
"Clevie"
,
"Clie"
,
"Cliff"
,
"Cliffes"
,
"Clifford"
,
"Clift"
,
"Clifton"
,
"Clim"
,
"Cline"
,
"Clint"
,
"Clintock"
,
"Clinton"
,
"Clio"
,
"Clippard"
,
"Clite"
,
"Clive"
,
"Clo"
,
"Cloe"
,
"Cloots"
,
"Clorinda"
,
"Clorinde"
,
"Cloris"
,
"Close"
,
"Clothilde"
,
"Clotilda"
,
"Clotilde"
,
"Clough"
,
"Clougher"
,
"Cloutman"
,
"Clova"
,
"Clovah"
,
"Clover"
,
"Clovis"
,
"Clower"
,
"Clute"
,
"Cly"
,
"Clyde"
,
"Clymer"
,
"Clynes"
,
"Clyte"
,
"Clyve"
,
"Clywd"
,
"Cnut"
,
"Coad"
,
"Coady"
,
"Coates"
,
"Coats"
,
"Cob"
,
"Cobb"
,
"Cobbie"
,
"Cobby"
,
"Coben"
,
"Cochard"
,
"Cochran"
,
"Cochrane"
,
"Cock"
,
"Cockburn"
,
"Cocke"
,
"Cocks"
,
"Coco"
,
"Codd"
,
"Codding"
,
"Codee"
,
"Codel"
,
"Codi"
,
"Codie"
,
"Cody"
,
"Coe"
,
"Coffee"
,
"Coffeng"
,
"Coffey"
,
"Coffin"
,
"Cofsky"
,
"Cogan"
,
"Cogen"
,
"Cogswell"
,
"Coh"
,
"Cohbath"
,
"Cohberg"
,
"Cohbert"
,
"Cohby"
,
"Cohdwell"
,
"Cohe"
,
"Coheman"
,
"Cohen"
,
"Cohette"
,
"Cohin"
,
"Cohl"
,
"Cohla"
,
"Cohleen"
,
"Cohlette"
,
"Cohlier"
,
"Cohligan"
,
"Cohn"
,
"Cointon"
,
"Coit"
,
"Coke"
,
"Col"
,
"Colan"
,
"Colas"
,
"Colb"
,
"Colbert"
,
"Colburn"
,
"Colby"
,
"Colbye"
,
"Cole"
,
"Coleen"
,
"Coleman"
,
"Colene"
,
"Colet"
,
"Coletta"
,
"Colette"
,
"Coleville"
,
"Colfin"
,
"Colier"
,
"Colin"
,
"Colinson"
,
"Colis"
,
"Collar"
,
"Collayer"
,
"Collbaith"
,
"Colleen"
,
"Collen"
,
"Collete"
,
"Collette"
,
"Colley"
,
"Collie"
,
"Collier"
,
"Colligan"
,
"Collimore"
,
"Collin"
,
"Colline"
,
"Collins"
,
"Collis"
,
"Collum"
,
"Colly"
,
"Collyer"
,
"Colman"
,
"Colner"
,
"Colombi"
,
"Colon"
,
"Colp"
,
"Colpin"
,
"Colson"
,
"Colston"
,
"Colt"
,
"Coltin"
,
"Colton"
,
"Coltson"
,
"Coltun"
,
"Columba"
,
"Columbine"
,
"Columbus"
,
"Columbyne"
,
"Colver"
,
"Colvert"
,
"Colville"
,
"Colvin"
,
"Colwell"
,
"Colwen"
,
"Colwin"
,
"Colyer"
,
"Combe"
,
"Combes"
,
"Combs"
,
"Comfort"
,
"Compte"
,
"Comptom"
,
"Compton"
,
"Comras"
,
"Comstock"
,
"Comyns"
,
"Con"
,
"Conah"
,
"Conal"
,
"Conall"
,
"Conan"
,
"Conant"
,
"Conard"
,
"Concepcion"
,
"Concettina"
,
"Concha"
,
"Conchita"
,
"Concoff"
,
"Concordia"
,
"Condon"
,
"Coney"
,
"Congdon"
,
"Conger"
,
"Coniah"
,
"Conias"
,
"Conlan"
,
"Conlee"
,
"Conlen"
,
"Conley"
,
"Conlin"
,
"Conlon"
,
"Conn"
,
"Connel"
,
"Connell"
,
"Connelley"
,
"Connelly"
,
"Conner"
,
"Conners"
,
"Connett"
,
"Conney"
,
"Conni"
,
"Connie"
,
"Connolly"
,
"Connor"
,
"Connors"
,
"Conny"
,
"Conover"
,
"Conrad"
,
"Conrade"
,
"Conrado"
,
"Conroy"
,
"Consalve"
,
"Consolata"
,
"Constance"
,
"Constancia"
,
"Constancy"
,
"Constant"
,
"Constanta"
,
"Constantia"
,
"Constantin"
,
"Constantina"
,
"Constantine"
,
"Constantino"
,
"Consuela"
,
"Consuelo"
,
"Conte"
,
"Conti"
,
"Converse"
,
"Convery"
,
"Conway"
,
"Cony"
,
"Conyers"
,
"Cooe"
,
"Cook"
,
"Cooke"
,
"Cookie"
,
"Cooley"
,
"Coombs"
,
"Coonan"
,
"Coop"
,
"Cooper"
,
"Cooperman"
,
"Coopersmith"
,
"Cooperstein"
,
"Cope"
,
"Copeland"
,
"Copland"
,
"Coplin"
,
"Copp"
,
"Coppinger"
,
"Coppins"
,
"Coppock"
,
"Coppola"
,
"Cora"
,
"Corabel"
,
"Corabella"
,
"Corabelle"
,
"Coral"
,
"Coralie"
,
"Coraline"
,
"Coralyn"
,
"Coray"
,
"Corbet"
,
"Corbett"
,
"Corbie"
,
"Corbin"
,
"Corby"
,
"Cord"
,
"Cordalia"
,
"Cordeelia"
,
"Cordelia"
,
"Cordelie"
,
"Cordell"
,
"Corder"
,
"Cordey"
,
"Cordi"
,
"Cordie"
,
"Cordier"
,
"Cordle"
,
"Cordova"
,
"Cordula"
,
"Cordy"
,
"Coreen"
,
"Corel"
,
"Corell"
,
"Corella"
,
"Corena"
,
"Corenda"
,
"Corene"
,
"Coretta"
,
"Corette"
,
"Corey"
,
"Cori"
,
"Coridon"
,
"Corie"
,
"Corilla"
,
"Corin"
,
"Corina"
,
"Corine"
,
"Corinna"
,
"Corinne"
,
"Coriss"
,
"Corissa"
,
"Corkhill"
,
"Corley"
,
"Corliss"
,
"Corly"
,
"Cormac"
,
"Cormack"
,
"Cormick"
,
"Cormier"
,
"Cornall"
,
"Corneille"
,
"Cornel"
,
"Cornela"
,
"Cornelia"
,
"Cornelie"
,
"Cornelius"
,
"Cornell"
,
"Cornelle"
,
"Cornew"
,
"Corney"
,
"Cornia"
,
"Cornie"
,
"Cornish"
,
"Cornwall"
,
"Cornwell"
,
"Corny"
,
"Corotto"
,
"Correna"
,
"Correy"
,
"Corri"
,
"Corrianne"
,
"Corrie"
,
"Corrina"
,
"Corrine"
,
"Corrinne"
,
"Corron"
,
"Corry"
,
"Corsetti"
,
"Corsiglia"
,
"Corso"
,
"Corson"
,
"Cort"
,
"Cortie"
,
"Cortney"
,
"Corty"
,
"Corvese"
,
"Corvin"
,
"Corwin"
,
"Corwun"
,
"Cory"
,
"Coryden"
,
"Corydon"
,
"Cos"
,
"Cosenza"
,
"Cosetta"
,
"Cosette"
,
"Coshow"
,
"Cosimo"
,
"Cosma"
,
"Cosme"
,
"Cosmo"
,
"Cost"
,
"Costa"
,
"Costanza"
,
"Costanzia"
,
"Costello"
,
"Coster"
,
"Costin"
,
"Cote"
,
"Cotsen"
,
"Cott"
,
"Cotter"
,
"Cotterell"
,
"Cottle"
,
"Cottrell"
,
"Coucher"
,
"Couchman"
,
"Coughlin"
,
"Coulombe"
,
"Coulson"
,
"Coulter"
,
"Coumas"
,
"Countess"
,
"Courcy"
,
"Court"
,
"Courtenay"
,
"Courtland"
,
"Courtnay"
,
"Courtney"
,
"Courtund"
,
"Cousin"
,
"Cousins"
,
"Coussoule"
,
"Couture"
,
"Covell"
,
"Coveney"
,
"Cowan"
,
"Coward"
,
"Cowden"
,
"Cowen"
,
"Cower"
,
"Cowey"
,
"Cowie"
,
"Cowles"
,
"Cowley"
,
"Cown"
,
"Cox"
,
"Coy"
,
"Coyle"
,
"Cozmo"
,
"Cozza"
,
"Crabb"
,
"Craddock"
,
"Craggie"
,
"Craggy"
,
"Craig"
,
"Crain"
,
"Cralg"
,
"Cram"
,
"Cramer"
,
"Cran"
,
"Crandale"
,
"Crandall"
,
"Crandell"
,
"Crane"
,
"Craner"
,
"Cranford"
,
"Cranston"
,
"Crary"
,
"Craven"
,
"Craw"
,
"Crawford"
,
"Crawley"
,
"Creamer"
,
"Crean"
,
"Creath"
,
"Creedon"
,
"Creigh"
,
"Creight"
,
"Creighton"
,
"Crelin"
,
"Crellen"
,
"Crenshaw"
,
"Cresa"
,
"Crescantia"
,
"Crescen"
,
"Crescentia"
,
"Crescin"
,
"Crescint"
,
"Cresida"
,
"Crespi"
,
"Crespo"
,
"Cressi"
,
"Cressida"
,
"Cressler"
,
"Cressy"
,
"Crichton"
,
"Crifasi"
,
"Crim"
,
"Crin"
,
"Cris"
,
"Crisey"
,
"Crispa"
,
"Crispas"
,
"Crispen"
,
"Crispin"
,
"Crissie"
,
"Crissy"
,
"Crist"
,
"Crista"
,
"Cristabel"
,
"Cristal"
,
"Cristen"
,
"Cristi"
,
"Cristian"
,
"Cristiano"
,
"Cristie"
,
"Cristin"
,
"Cristina"
,
"Cristine"
,
"Cristiona"
,
"Cristionna"
,
"Cristobal"
,
"Cristoforo"
,
"Cristy"
,
"Criswell"
,
"Critchfield"
,
"Critta"
,
"Crocker"
,
"Crockett"
,
"Crofoot"
,
"Croft"
,
"Crofton"
,
"Croix"
,
"Crompton"
,
"Cromwell"
,
"Croner"
,
"Cronin"
,
"Crooks"
,
"Croom"
,
"Crosby"
,
"Crosley"
,
"Cross"
,
"Crosse"
,
"Croteau"
,
"Crotty"
,
"Crow"
,
"Crowe"
,
"Crowell"
,
"Crowley"
,
"Crowns"
,
"Croydon"
,
"Cruce"
,
"Crudden"
,
"Cruickshank"
,
"Crutcher"
,
"Cruz"
,
"Cryan"
,
"Crysta"
,
"Crystal"
,
"Crystie"
,
"Cthrine"
,
"Cuda"
,
"Cudlip"
,
"Culberson"
,
"Culbert"
,
"Culbertson"
,
"Culhert"
,
"Cull"
,
"Cullan"
,
"Cullen"
,
"Culley"
,
"Cullie"
,
"Cullin"
,
"Culliton"
,
"Cully"
,
"Culosio"
,
"Culver"
,
"Cumine"
,
"Cumings"
,
"Cummine"
,
"Cummings"
,
"Cummins"
,
"Cung"
,
"Cunningham"
,
"Cupo"
,
"Curcio"
,
"Curhan"
,
"Curkell"
,
"Curley"
,
"Curnin"
,
"Curr"
,
"Curran"
,
"Curren"
,
"Currey"
,
"Currie"
,
"Currier"
,
"Curry"
,
"Curson"
,
"Curt"
,
"Curtice"
,
"Curtis"
,
"Curzon"
,
"Cusack"
,
"Cusick"
,
"Custer"
,
"Cut"
,
"Cutcheon"
,
"Cutcliffe"
,
"Cuthbert"
,
"Cuthbertson"
,
"Cuthburt"
,
"Cutler"
,
"Cutlerr"
,
"Cutlip"
,
"Cutlor"
,
"Cutter"
,
"Cuttie"
,
"Cuttler"
,
"Cutty"
,
"Cuyler"
,
"Cy"
,
"Cyb"
,
"Cybil"
,
"Cybill"
,
"Cychosz"
,
"Cyd"
,
"Cykana"
,
"Cyler"
,
"Cyma"
,
"Cymbre"
,
"Cyn"
,
"Cyna"
,
"Cynar"
,
"Cynara"
,
"Cynarra"
,
"Cynde"
,
"Cyndi"
,
"Cyndia"
,
"Cyndie"
,
"Cyndy"
,
"Cynera"
,
"Cynth"
,
"Cynthea"
,
"Cynthia"
,
"Cynthie"
,
"Cynthla"
,
"Cynthy"
,
"Cyprian"
,
"Cyprio"
,
"Cypro"
,
"Cyprus"
,
"Cyrano"
,
"Cyrie"
,
"Cyril"
,
"Cyrill"
,
"Cyrilla"
,
"Cyrille"
,
"Cyrillus"
,
"Cyrus"
,
"Czarra"
,
"D'Arcy"
,
"Dabbs"
,
"Daberath"
,
"Dabney"
,
"Dace"
,
"Dacey"
,
"Dachi"
,
"Dachia"
,
"Dachy"
,
"Dacia"
,
"Dacie"
,
"Dacy"
,
"Daegal"
,
"Dael"
,
"Daffi"
,
"Daffie"
,
"Daffodil"
,
"Daffy"
,
"Dafna"
,
"Dafodil"
,
"Dag"
,
"Dagall"
,
"Daggett"
,
"Daggna"
,
"Dagley"
,
"Dagmar"
,
"Dagna"
,
"Dagnah"
,
"Dagney"
,
"Dagny"
,
"Dahl"
,
"Dahle"
,
"Dahlia"
,
"Dahlstrom"
,
"Daigle"
,
"Dail"
,
"Daile"
,
"Dailey"
,
"Daisey"
,
"Daisi"
,
"Daisie"
,
"Daisy"
,
"Daitzman"
,
"Dal"
,
"Dale"
,
"Dalenna"
,
"Daley"
,
"Dalia"
,
"Dalila"
,
"Dalis"
,
"Dall"
,
"Dallas"
,
"Dalli"
,
"Dallis"
,
"Dallman"
,
"Dallon"
,
"Daloris"
,
"Dalpe"
,
"Dalston"
,
"Dalt"
,
"Dalton"
,
"Dalury"
,
"Daly"
,
"Dam"
,
"Damal"
,
"Damalas"
,
"Damales"
,
"Damali"
,
"Damalis"
,
"Damalus"
,
"Damara"
,
"Damaris"
,
"Damarra"
,
"Dambro"
,
"Dame"
,
"Damek"
,
"Damian"
,
"Damiani"
,
"Damiano"
,
"Damick"
,
"Damicke"
,
"Damien"
,
"Damita"
,
"Damle"
,
"Damon"
,
"Damour"
,
"Dan"
,
"Dana"
,
"Danae"
,
"Danaher"
,
"Danais"
,
"Danas"
,
"Danby"
,
"Danczyk"
,
"Dane"
,
"Danell"
,
"Danella"
,
"Danelle"
,
"Danete"
,
"Danette"
,
"Daney"
,
"Danforth"
,
"Dang"
,
"Dani"
,
"Dania"
,
"Daniala"
,
"Danialah"
,
"Danica"
,
"Danice"
,
"Danie"
,
"Daniel"
,
"Daniela"
,
"Daniele"
,
"Daniell"
,
"Daniella"
,
"Danielle"
,
"Daniels"
,
"Danielson"
,
"Danieu"
,
"Danika"
,
"Danila"
,
"Danit"
,
"Danita"
,
"Daniyal"
,
"Dann"
,
"Danna"
,
"Dannel"
,
"Danni"
,
"Dannica"
,
"Dannie"
,
"Dannon"
,
"Danny"
,
"Dannye"
,
"Dante"
,
"Danuloff"
,
"Danya"
,
"Danyelle"
,
"Danyette"
,
"Danyluk"
,
"Danzig"
,
"Danziger"
,
"Dao"
,
"Daph"
,
"Daphene"
,
"Daphie"
,
"Daphna"
,
"Daphne"
,
"Dar"
,
"Dara"
,
"Darach"
,
"Darb"
,
"Darbee"
,
"Darbie"
,
"Darby"
,
"Darce"
,
"Darcee"
,
"Darcey"
,
"Darci"
,
"Darcia"
,
"Darcie"
,
"Darcy"
,
"Darda"
,
"Dardani"
,
"Dare"
,
"Dareece"
,
"Dareen"
,
"Darees"
,
"Darell"
,
"Darelle"
,
"Daren"
,
"Dari"
,
"Daria"
,
"Darian"
,
"Darice"
,
"Darill"
,
"Darin"
,
"Dario"
,
"Darius"
,
"Darken"
,
"Darla"
,
"Darleen"
,
"Darlene"
,
"Darline"
,
"Darlleen"
,
"Darmit"
,
"Darn"
,
"Darnall"
,
"Darnell"
,
"Daron"
,
"Darooge"
,
"Darra"
,
"Darrel"
,
"Darrell"
,
"Darrelle"
,
"Darren"
,
"Darrey"
,
"Darrick"
,
"Darrill"
,
"Darrin"
,
"Darrow"
,
"Darryl"
,
"Darryn"
,
"Darsey"
,
"Darsie"
,
"Dart"
,
"Darton"
,
"Darwen"
,
"Darwin"
,
"Darya"
,
"Daryl"
,
"Daryle"
,
"Daryn"
,
"Dash"
,
"Dasha"
,
"Dasi"
,
"Dasie"
,
"Dasteel"
,
"Dasya"
,
"Datha"
,
"Datnow"
,
"Daub"
,
"Daugherty"
,
"Daughtry"
,
"Daukas"
,
"Daune"
,
"Dav"
,
"Dave"
,
"Daveda"
,
"Daveen"
,
"Daven"
,
"Davena"
,
"Davenport"
,
"Daveta"
,
"Davey"
,
"David"
,
"Davida"
,
"Davidde"
,
"Davide"
,
"Davidoff"
,
"Davidson"
,
"Davie"
,
"Davies"
,
"Davilman"
,
"Davin"
,
"Davina"
,
"Davine"
,
"Davis"
,
"Davison"
,
"Davita"
,
"Davon"
,
"Davy"
,
"Dawes"
,
"Dawkins"
,
"Dawn"
,
"Dawna"
,
"Dawson"
,
"Day"
,
"Daye"
,
"Dayle"
,
"Dayna"
,
"Ddene"
,
"De"
,
"De Witt"
,
"Deach"
,
"Deacon"
,
"Deadman"
,
"Dean"
,
"Deana"
,
"Deane"
,
"Deaner"
,
"Deanna"
,
"Deanne"
,
"Dearborn"
,
"Dearden"
,
"Dearman"
,
"Dearr"
,
"Deb"
,
"Debarath"
,
"Debbee"
,
"Debbi"
,
"Debbie"
,
"Debbra"
,
"Debby"
,
"Debee"
,
"Debera"
,
"Debi"
,
"Debor"
,
"Debora"
,
"Deborah"
,
"Deborath"
,
"Debra"
,
"Decamp"
,
"Decato"
,
"Decca"
,
"December"
,
"Decima"
,
"Deck"
,
"Decker"
,
"Deckert"
,
"Declan"
,
"Dede"
,
"Deden"
,
"Dedie"
,
"Dedra"
,
"Dedric"
,
"Dedrick"
,
"Dee"
,
"Dee Dee"
,
"DeeAnn"
,
"Deeann"
,
"Deeanne"
,
"Deedee"
,
"Deegan"
,
"Deena"
,
"Deenya"
,
"Deer"
,
"Deerdre"
,
"Deering"
,
"Deery"
,
"Deeyn"
,
"Defant"
,
"Dehlia"
,
"Dehnel"
,
"Deibel"
,
"Deidre"
,
"Deina"
,
"Deirdra"
,
"Deirdre"
,
"Dekeles"
,
"Dekow"
,
"Del"
,
"Dela"
,
"Delacourt"
,
"Delaine"
,
"Delainey"
,
"Delamare"
,
"Deland"
,
"Delaney"
,
"Delanie"
,
"Delano"
,
"Delanos"
,
"Delanty"
,
"Delaryd"
,
"Delastre"
,
"Delbert"
,
"Delcina"
,
"Delcine"
,
"Delfeena"
,
"Delfine"
,
"Delgado"
,
"Delia"
,
"Delija"
,
"Delila"
,
"Delilah"
,
"Delinda"
,
"Delisle"
,
"Dell"
,
"Della"
,
"Delle"
,
"Dellora"
,
"Delly"
,
"Delmar"
,
"Delmer"
,
"Delmor"
,
"Delmore"
,
"Delogu"
,
"Delora"
,
"Delorenzo"
,
"Delores"
,
"Deloria"
,
"Deloris"
,
"Delos"
,
"Delp"
,
"Delphina"
,
"Delphine"
,
"Delphinia"
,
"Delsman"
,
"Delwin"
,
"Delwyn"
,
"Demaggio"
,
"Demakis"
,
"Demaria"
,
"Demb"
,
"Demeter"
,
"Demetra"
,
"Demetre"
,
"Demetri"
,
"Demetria"
,
"Demetris"
,
"Demetrius"
,
"Demeyer"
,
"Deming"
,
"Demitria"
,
"Demmer"
,
"Demmy"
,
"Demodena"
,
"Demona"
,
"Demott"
,
"Demp"
,
"Dempsey"
,
"Dempster"
,
"Dempstor"
,
"Demy"
,
"Den"
,
"Dena"
,
"Denae"
,
"Denbrook"
,
"Denby"
,
"Dene"
,
"Deni"
,
"Denice"
,
"Denie"
,
"Denis"
,
"Denise"
,
"Denison"
,
"Denman"
,
"Denn"
,
"Denna"
,
"Dennard"
,
"Dennet"
,
"Dennett"
,
"Denney"
,
"Denni"
,
"Dennie"
,
"Dennis"
,
"Dennison"
,
"Denny"
,
"Denoting"
,
"Dent"
,
"Denten"
,
"Denton"
,
"Denver"
,
"Deny"
,
"Denys"
,
"Denyse"
,
"Denzil"
,
"Deonne"
,
"Depoliti"
,
"Deppy"
,
"Der"
,
"Deragon"
,
"Derayne"
,
"Derby"
,
"Dercy"
,
"Derek"
,
"Derian"
,
"Derick"
,
"Derina"
,
"Derinna"
,
"Derk"
,
"Derman"
,
"Dermot"
,
"Dermott"
,
"Derna"
,
"Deron"
,
"Deroo"
,
"Derr"
,
"Derrek"
,
"Derrick"
,
"Derriey"
,
"Derrik"
,
"Derril"
,
"Derron"
,
"Derry"
,
"Derte"
,
"Derward"
,
"Derwin"
,
"Derwon"
,
"Derwood"
,
"Deryl"
,
"Derzon"
,
"Des"
,
"Desai"
,
"Desberg"
,
"Descombes"
,
"Desdamona"
,
"Desdamonna"
,
"Desdee"
,
"Desdemona"
,
"Desi"
,
"Desimone"
,
"Desirae"
,
"Desirea"
,
"Desireah"
,
"Desiree"
,
"Desiri"
,
"Desma"
,
"Desmond"
,
"Desmund"
,
"Dessma"
,
"Desta"
,
"Deste"
,
"Destinee"
,
"Deth"
,
"Dett"
,
"Detta"
,
"Dettmer"
,
"Deuno"
,
"Deutsch"
,
"Dev"
,
"Deva"
,
"Devan"
,
"Devaney"
,
"Dever"
,
"Devi"
,
"Devin"
,
"Devina"
,
"Devine"
,
"Devinna"
,
"Devinne"
,
"Devitt"
,
"Devland"
,
"Devlen"
,
"Devlin"
,
"Devol"
,
"Devon"
,
"Devona"
,
"Devondra"
,
"Devonna"
,
"Devonne"
,
"Devora"
,
"Devy"
,
"Dew"
,
"Dewain"
,
"Dewar"
,
"Dewayne"
,
"Dewees"
,
"Dewey"
,
"Dewhirst"
,
"Dewhurst"
,
"Dewie"
,
"Dewitt"
,
"Dex"
,
"Dexter"
,
"Dey"
,
"Dhar"
,
"Dhiman"
,
"Dhiren"
,
"Dhruv"
,
"Dhu"
,
"Dhumma"
,
"Di"
,
"Diahann"
,
"Diamante"
,
"Diamond"
,
"Dian"
,
"Diana"
,
"Diandra"
,
"Diandre"
,
"Diane"
,
"Diane-Marie"
,
"Dianemarie"
,
"Diann"
,
"Dianna"
,
"Dianne"
,
"Diannne"
,
"Diantha"
,
"Dianthe"
,
"Diao"
,
"Diarmid"
,
"Diarmit"
,
"Diarmuid"
,
"Diaz"
,
"Dib"
,
"Diba"
,
"Dibb"
,
"Dibbell"
,
"Dibbrun"
,
"Dibri"
,
"Dibrin"
,
"Dibru"
,
"Dich"
,
"Dichy"
,
"Dick"
,
"Dickens"
,
"Dickenson"
,
"Dickerson"
,
"Dickey"
,
"Dickie"
,
"Dickinson"
,
"Dickman"
,
"Dicks"
,
"Dickson"
,
"Dicky"
,
"Didi"
,
"Didier"
,
"Dido"
,
"Dieball"
,
"Diego"
,
"Diehl"
,
"Diella"
,
"Dielle"
,
"Dielu"
,
"Diena"
,
"Dierdre"
,
"Dierolf"
,
"Diet"
,
"Dieter"
,
"Dieterich"
,
"Dietrich"
,
"Dietsche"
,
"Dietz"
,
"Dikmen"
,
"Dilan"
,
"Diley"
,
"Dilisio"
,
"Dilks"
,
"Dill"
,
"Dillie"
,
"Dillon"
,
"Dilly"
,
"Dimitri"
,
"Dimitris"
,
"Dimitry"
,
"Dimmick"
,
"Dimond"
,
"Dimphia"
,
"Dina"
,
"Dinah"
,
"Dinan"
,
"Dincolo"
,
"Dine"
,
"Dinerman"
,
"Dinesh"
,
"Dinin"
,
"Dinnage"
,
"Dinnie"
,
"Dinny"
,
"Dino"
,
"Dinsdale"
,
"Dinse"
,
"Dinsmore"
,
"Diogenes"
,
"Dion"
,
"Dione"
,
"Dionis"
,
"Dionisio"
,
"Dionne"
,
"Dionysus"
,
"Dippold"
,
"Dira"
,
"Dirk"
,
"Disario"
,
"Disharoon"
,
"Disini"
,
"Diskin"
,
"Diskson"
,
"Disraeli"
,
"Dita"
,
"Ditmore"
,
"Ditter"
,
"Dittman"
,
"Dituri"
,
"Ditzel"
,
"Diver"
,
"Divine"
,
"Dix"
,
"Dixie"
,
"Dixil"
,
"Dixon"
,
"Dmitri"
,
"Dniren"
,
"Doak"
,
"Doane"
,
"Dobb"
,
"Dobbins"
,
"Doble"
,
"Dobrinsky"
,
"Dobson"
,
"Docia"
,
"Docila"
,
"Docile"
,
"Docilla"
,
"Docilu"
,
"Dodd"
,
"Dodds"
,
"Dode"
,
"Dodge"
,
"Dodi"
,
"Dodie"
,
"Dodson"
,
"Dodwell"
,
"Dody"
,
"Doe"
,
"Doehne"
,
"Doelling"
,
"Doerrer"
,
"Doersten"
,
"Doggett"
,
"Dogs"
,
"Doherty"
,
"Doi"
,
"Doig"
,
"Dola"
,
"Dolan"
,
"Dole"
,
"Doley"
,
"Dolf"
,
"Dolhenty"
,
"Doll"
,
"Dollar"
,
"Dolley"
,
"Dolli"
,
"Dollie"
,
"Dolloff"
,
"Dolly"
,
"Dolora"
,
"Dolores"
,
"Dolorita"
,
"Doloritas"
,
"Dolph"
,
"Dolphin"
,
"Dom"
,
"Domash"
,
"Dombrowski"
,
"Domel"
,
"Domela"
,
"Domella"
,
"Domenech"
,
"Domenic"
,
"Domenico"
,
"Domeniga"
,
"Domineca"
,
"Dominga"
,
"Domingo"
,
"Domini"
,
"Dominic"
,
"Dominica"
,
"Dominick"
,
"Dominik"
,
"Dominique"
,
"Dominus"
,
"Dominy"
,
"Domonic"
,
"Domph"
,
"Don"
,
"Dona"
,
"Donadee"
,
"Donaghue"
,
"Donahoe"
,
"Donahue"
,
"Donal"
,
"Donald"
,
"Donaldson"
,
"Donall"
,
"Donalt"
,
"Donata"
,
"Donatelli"
,
"Donaugh"
,
"Donavon"
,
"Donegan"
,
"Donela"
,
"Donell"
,
"Donella"
,
"Donelle"
,
"Donelson"
,
"Donelu"
,
"Doner"
,
"Donetta"
,
"Dong"
,
"Donia"
,
"Donica"
,
"Donielle"
,
"Donn"
,
"Donna"
,
"Donnamarie"
,
"Donnell"
,
"Donnelly"
,
"Donnenfeld"
,
"Donni"
,
"Donnie"
,
"Donny"
,
"Donoghue"
,
"Donoho"
,
"Donohue"
,
"Donough"
,
"Donovan"
,
"Doolittle"
,
"Doone"
,
"Dopp"
,
"Dora"
,
"Doralia"
,
"Doralin"
,
"Doralyn"
,
"Doralynn"
,
"Doralynne"
,
"Doran"
,
"Dorca"
,
"Dorcas"
,
"Dorcea"
,
"Dorcia"
,
"Dorcus"
,
"Dorcy"
,
"Dore"
,
"Doreen"
,
"Dorelia"
,
"Dorella"
,
"Dorelle"
,
"Dorena"
,
"Dorene"
,
"Doretta"
,
"Dorette"
,
"Dorey"
,
"Dorfman"
,
"Dori"
,
"Doria"
,
"Dorian"
,
"Dorice"
,
"Dorie"
,
"Dorin"
,
"Dorina"
,
"Dorinda"
,
"Dorine"
,
"Dorion"
,
"Doris"
,
"Dorisa"
,
"Dorise"
,
"Dorison"
,
"Dorita"
,
"Dorkas"
,
"Dorkus"
,
"Dorlisa"
,
"Dorman"
,
"Dorn"
,
"Doro"
,
"Dorolice"
,
"Dorolisa"
,
"Dorotea"
,
"Doroteya"
,
"Dorothea"
,
"Dorothee"
,
"Dorothi"
,
"Dorothy"
,
"Dorr"
,
"Dorran"
,
"Dorree"
,
"Dorren"
,
"Dorri"
,
"Dorrie"
,
"Dorris"
,
"Dorry"
,
"Dorsey"
,
"Dorsman"
,
"Dorsy"
,
"Dorthea"
,
"Dorthy"
,
"Dorweiler"
,
"Dorwin"
,
"Dory"
,
"Doscher"
,
"Dosh"
,
"Dosi"
,
"Dosia"
,
"Doss"
,
"Dot"
,
"Doti"
,
"Dotson"
,
"Dott"
,
"Dotti"
,
"Dottie"
,
"Dotty"
,
"Doty"
,
"Doubler"
,
"Doug"
,
"Dougal"
,
"Dougald"
,
"Dougall"
,
"Dougherty"
,
"Doughman"
,
"Doughty"
,
"Dougie"
,
"Douglas"
,
"Douglass"
,
"Dougy"
,
"Douty"
,
"Douville"
,
"Dov"
,
"Dove"
,
"Dovev"
,
"Dow"
,
"Dowd"
,
"Dowdell"
,
"Dowell"
,
"Dowlen"
,
"Dowling"
,
"Down"
,
"Downall"
,
"Downe"
,
"Downes"
,
"Downey"
,
"Downing"
,
"Downs"
,
"Dowski"
,
"Dowzall"
,
"Doxia"
,
"Doy"
,
"Doykos"
,
"Doyle"
,
"Drabeck"
,
"Dragelin"
,
"Dragon"
,
"Dragone"
,
"Dragoon"
,
"Drain"
,
"Drais"
,
"Drake"
,
"Drandell"
,
"Drape"
,
"Draper"
,
"Dray"
,
"Dre"
,
"Dream"
,
"Dreda"
,
"Dreddy"
,
"Dredi"
,
"Dreeda"
,
"Dreher"
,
"Dremann"
,
"Drescher"
,
"Dressel"
,
"Dressler"
,
"Drew"
,
"Drewett"
,
"Drews"
,
"Drexler"
,
"Dreyer"
,
"Dric"
,
"Drice"
,
"Drida"
,
"Dripps"
,
"Driscoll"
,
"Driskill"
,
"Drisko"
,
"Drislane"
,
"Drobman"
,
"Drogin"
,
"Drolet"
,
"Drona"
,
"Dronski"
,
"Drooff"
,
"Dru"
,
"Druce"
,
"Druci"
,
"Drucie"
,
"Drucill"
,
"Drucilla"
,
"Drucy"
,
"Drud"
,
"Drue"
,
"Drugge"
,
"Drugi"
,
"Drummond"
,
"Drus"
,
"Drusi"
,
"Drusie"
,
"Drusilla"
,
"Drusus"
,
"Drusy"
,
"Dry"
,
"Dryden"
,
"Drye"
,
"Dryfoos"
,
"DuBois"
,
"Duane"
,
"Duarte"
,
"Duax"
,
"Dubenko"
,
"Dublin"
,
"Ducan"
,
"Duck"
,
"Dud"
,
"Dudden"
,
"Dudley"
,
"Duer"
,
"Duester"
,
"Duff"
,
"Duffie"
,
"Duffy"
,
"Dugaid"
,
"Dugald"
,
"Dugan"
,
"Dugas"
,
"Duggan"
,
"Duhl"
,
"Duke"
,
"Dukey"
,
"Dukie"
,
"Duky"
,
"Dulce"
,
"Dulcea"
,
"Dulci"
,
"Dulcia"
,
"Dulciana"
,
"Dulcie"
,
"Dulcine"
,
"Dulcinea"
,
"Dulcle"
,
"Dulcy"
,
"Duleba"
,
"Dulla"
,
"Dulsea"
,
"Duma"
,
"Dumah"
,
"Dumanian"
,
"Dumas"
,
"Dumm"
,
"Dumond"
,
"Dun"
,
"Dunaville"
,
"Dunc"
,
"Duncan"
,
"Dunham"
,
"Dunkin"
,
"Dunlavy"
,
"Dunn"
,
"Dunning"
,
"Dunseath"
,
"Dunson"
,
"Dunstan"
,
"Dunston"
,
"Dunton"
,
"Duntson"
,
"Duong"
,
"Dupaix"
,
"Dupin"
,
"Dupre"
,
"Dupuis"
,
"Dupuy"
,
"Duquette"
,
"Dur"
,
"Durand"
,
"Durant"
,
"Durante"
,
"Durarte"
,
"Durer"
,
"Durgy"
,
"Durham"
,
"Durkee"
,
"Durkin"
,
"Durman"
,
"Durnan"
,
"Durning"
,
"Durno"
,
"Durr"
,
"Durrace"
,
"Durrell"
,
"Durrett"
,
"Durst"
,
"Durstin"
,
"Durston"
,
"Durtschi"
,
"Durward"
,
"Durware"
,
"Durwin"
,
"Durwood"
,
"Durwyn"
,
"Dusa"
,
"Dusen"
,
"Dust"
,
"Dustan"
,
"Duster"
,
"Dustie"
,
"Dustin"
,
"Dustman"
,
"Duston"
,
"Dusty"
,
"Dusza"
,
"Dutch"
,
"Dutchman"
,
"Duthie"
,
"Duval"
,
"Duvall"
,
"Duwalt"
,
"Duwe"
,
"Duyne"
,
"Dwain"
,
"Dwaine"
,
"Dwan"
,
"Dwane"
,
"Dwayne"
,
"Dweck"
,
"Dwight"
,
"Dwinnell"
,
"Dworman"
,
"Dwyer"
,
"Dyal"
,
"Dyan"
,
"Dyana"
,
"Dyane"
,
"Dyann"
,
"Dyanna"
,
"Dyanne"
,
"Dyche"
,
"Dyer"
,
"Dygal"
,
"Dygall"
,
"Dygert"
,
"Dyke"
,
"Dyl"
,
"Dylan"
,
"Dylana"
,
"Dylane"
,
"Dymoke"
,
"Dympha"
,
"Dymphia"
,
"Dyna"
,
"Dynah"
,
"Dysart"
,
"Dyson"
,
"Dyun"
,
"Dzoba"
,
"Eachelle"
,
"Eachern"
,
"Eada"
,
"Eade"
,
"Eadie"
,
"Eadith"
,
"Eadmund"
,
"Eads"
,
"Eadwina"
,
"Eadwine"
,
"Eagle"
,
"Eal"
,
"Ealasaid"
,
"Eamon"
,
"Eanore"
,
"Earl"
,
"Earla"
,
"Earle"
,
"Earleen"
,
"Earlene"
,
"Earley"
,
"Earlie"
,
"Early"
,
"Eartha"
,
"Earvin"
,
"East"
,
"Easter"
,
"Eastlake"
,
"Eastman"
,
"Easton"
,
"Eaton"
,
"Eatton"
,
"Eaves"
,
"Eb"
,
"Eba"
,
"Ebarta"
,
"Ebba"
,
"Ebbarta"
,
"Ebberta"
,
"Ebbie"
,
"Ebby"
,
"Eben"
,
"Ebeneser"
,
"Ebenezer"
,
"Eberhard"
,
"Eberhart"
,
"Eberle"
,
"Eberly"
,
"Ebert"
,
"Eberta"
,
"Eberto"
,
"Ebner"
,
"Ebneter"
,
"Eboh"
,
"Ebonee"
,
"Ebony"
,
"Ebsen"
,
"Echikson"
,
"Echo"
,
"Eckardt"
,
"Eckart"
,
"Eckblad"
,
"Eckel"
,
"Eckhardt"
,
"Eckmann"
,
"Econah"
,
"Ed"
,
"Eda"
,
"Edan"
,
"Edana"
,
"Edbert"
,
"Edd"
,
"Edda"
,
"Eddana"
,
"Eddi"
,
"Eddie"
,
"Eddina"
,
"Eddra"
,
"Eddy"
,
"Ede"
,
"Edea"
,
"Edee"
,
"Edeline"
,
"Edelman"
,
"Edelson"
,
"Edelstein"
,
"Edelsten"
,
"Eden"
,
"Edette"
,
"Edgar"
,
"Edgard"
,
"Edgardo"
,
"Edge"
,
"Edgell"
,
"Edgerton"
,
"Edholm"
,
"Edi"
,
"Edie"
,
"Edik"
,
"Edin"
,
"Edina"
,
"Edison"
,
"Edita"
,
"Edith"
,
"Editha"
,
"Edithe"
,
"Ediva"
,
"Edla"
,
"Edlin"
,
"Edlun"
,
"Edlyn"
,
"Edmanda"
,
"Edme"
,
"Edmea"
,
"Edmead"
,
"Edmee"
,
"Edmon"
,
"Edmond"
,
"Edmonda"
,
"Edmondo"
,
"Edmonds"
,
"Edmund"
,
"Edmunda"
,
"Edna"
,
"Edny"
,
"Edora"
,
"Edouard"
,
"Edra"
,
"Edrea"
,
"Edrei"
,
"Edric"
,
"Edrick"
,
"Edris"
,
"Edrock"
,
"Edroi"
,
"Edsel"
,
"Edson"
,
"Eduard"
,
"Eduardo"
,
"Eduino"
,
"Edva"
,
"Edvard"
,
"Edveh"
,
"Edward"
,
"Edwards"
,
"Edwin"
,
"Edwina"
,
"Edwine"
,
"Edwyna"
,
"Edy"
,
"Edyth"
,
"Edythe"
,
"Effie"
,
"Effy"
,
"Efram"
,
"Efrem"
,
"Efren"
,
"Efron"
,
"Efthim"
,
"Egan"
,
"Egarton"
,
"Egbert"
,
"Egerton"
,
"Eggett"
,
"Eggleston"
,
"Egide"
,
"Egidio"
,
"Egidius"
,
"Egin"
,
"Eglanteen"
,
"Eglantine"
,
"Egon"
,
"Egor"
,
"Egwan"
,
"Egwin"
,
"Ehling"
,
"Ehlke"
,
"Ehman"
,
"Ehr"
,
"Ehrenberg"
,
"Ehrlich"
,
"Ehrman"
,
"Ehrsam"
,
"Ehud"
,
"Ehudd"
,
"Eichman"
,
"Eidson"
,
"Eiger"
,
"Eileen"
,
"Eilis"
,
"Eimile"
,
"Einberger"
,
"Einhorn"
,
"Eipper"
,
"Eirena"
,
"Eirene"
,
"Eisele"
,
"Eisen"
,
"Eisenberg"
,
"Eisenhart"
,
"Eisenstark"
,
"Eiser"
,
"Eisinger"
,
"Eisler"
,
"Eiten"
,
"Ekaterina"
,
"El"
,
"Ela"
,
"Elah"
,
"Elaina"
,
"Elaine"
,
"Elana"
,
"Elane"
,
"Elata"
,
"Elatia"
,
"Elayne"
,
"Elazaro"
,
"Elbart"
,
"Elberfeld"
,
"Elbert"
,
"Elberta"
,
"Elbertina"
,
"Elbertine"
,
"Elboa"
,
"Elbring"
,
"Elburr"
,
"Elburt"
,
"Elconin"
,
"Elda"
,
"Elden"
,
"Elder"
,
"Eldin"
,
"Eldon"
,
"Eldora"
,
"Eldorado"
,
"Eldoree"
,
"Eldoria"
,
"Eldred"
,
"Eldreda"
,
"Eldredge"
,
"Eldreeda"
,
"Eldrid"
,
"Eldrida"
,
"Eldridge"
,
"Eldwen"
,
"Eldwin"
,
"Eldwon"
,
"Eldwun"
,
"Eleanor"
,
"Eleanora"
,
"Eleanore"
,
"Eleazar"
,
"Electra"
,
"Eleen"
,
"Elena"
,
"Elene"
,
"Eleni"
,
"Elenore"
,
"Eleonora"
,
"Eleonore"
,
"Eleph"
,
"Elephus"
,
"Elery"
,
"Elexa"
,
"Elfie"
,
"Elfont"
,
"Elfreda"
,
"Elfrida"
,
"Elfrieda"
,
"Elfstan"
,
"Elga"
,
"Elgar"
,
"Eli"
,
"Elia"
,
"Eliades"
,
"Elianora"
,
"Elianore"
,
"Elias"
,
"Eliason"
,
"Eliath"
,
"Eliathan"
,
"Eliathas"
,
"Elicia"
,
"Elidad"
,
"Elie"
,
"Eliezer"
,
"Eliga"
,
"Elihu"
,
"Elijah"
,
"Elinor"
,
"Elinore"
,
"Eliot"
,
"Eliott"
,
"Elisa"
,
"Elisabet"
,
"Elisabeth"
,
"Elisabetta"
,
"Elise"
,
"Elisee"
,
"Eliseo"
,
"Elish"
,
"Elisha"
,
"Elison"
,
"Elissa"
,
"Elita"
,
"Eliza"
,
"Elizabet"
,
"Elizabeth"
,
"Elka"
,
"Elke"
,
"Elkin"
,
"Ella"
,
"Elladine"
,
"Ellan"
,
"Ellard"
,
"Ellary"
,
"Ellata"
,
"Elle"
,
"Ellen"
,
"Ellene"
,
"Ellerd"
,
"Ellerey"
,
"Ellersick"
,
"Ellery"
,
"Ellett"
,
"Ellette"
,
"Ellga"
,
"Elli"
,
"Ellicott"
,
"Ellie"
,
"Ellinger"
,
"Ellingston"
,
"Elliot"
,
"Elliott"
,
"Ellis"
,
"Ellison"
,
"Ellissa"
,
"Ellita"
,
"Ellmyer"
,
"Ellon"
,
"Ellora"
,
"Ellord"
,
"Ellswerth"
,
"Ellsworth"
,
"Ellwood"
,
"Elly"
,
"Ellyn"
,
"Ellynn"
,
"Elma"
,
"Elmajian"
,
"Elmaleh"
,
"Elman"
,
"Elmer"
,
"Elmina"
,
"Elmira"
,
"Elmo"
,
"Elmore"
,
"Elna"
,
"Elnar"
,
"Elnora"
,
"Elnore"
,
"Elo"
,
"Elodea"
,
"Elodia"
,
"Elodie"
,
"Eloisa"
,
"Eloise"
,
"Elon"
,
"Elonore"
,
"Elora"
,
"Elreath"
,
"Elrod"
,
"Elroy"
,
"Els"
,
"Elsa"
,
"Elsbeth"
,
"Else"
,
"Elset"
,
"Elsey"
,
"Elsi"
,
"Elsie"
,
"Elsinore"
,
"Elson"
,
"Elspet"
,
"Elspeth"
,
"Elstan"
,
"Elston"
,
"Elsworth"
,
"Elsy"
,
"Elton"
,
"Elum"
,
"Elurd"
,
"Elva"
,
"Elvah"
,
"Elvera"
,
"Elvia"
,
"Elvie"
,
"Elvin"
,
"Elvina"
,
"Elvira"
,
"Elvis"
,
"Elvyn"
,
"Elwaine"
,
"Elwee"
,
"Elwin"
,
"Elwina"
,
"Elwira"
,
"Elwood"
,
"Elwyn"
,
"Ely"
,
"Elyn"
,
"Elyse"
,
"Elysee"
,
"Elysha"
,
"Elysia"
,
"Elyssa"
,
"Em"
,
"Ema"
,
"Emad"
,
"Emalee"
,
"Emalia"
,
"Emanuel"
,
"Emanuela"
,
"Emanuele"
,
"Emarie"
,
"Embry"
,
"Emee"
,
"Emelda"
,
"Emelen"
,
"Emelia"
,
"Emelin"
,
"Emelina"
,
"Emeline"
,
"Emelita"
,
"Emelun"
,
"Emelyne"
,
"Emera"
,
"Emerald"
,
"Emeric"
,
"Emerick"
,
"Emersen"
,
"Emerson"
,
"Emery"
,
"Emie"
,
"Emil"
,
"Emile"
,
"Emilee"
,
"Emili"
,
"Emilia"
,
"Emilie"
,
"Emiline"
,
"Emilio"
,
"Emily"
,
"Emina"
,
"Emlen"
,
"Emlin"
,
"Emlyn"
,
"Emlynn"
,
"Emlynne"
,
"Emma"
,
"Emmalee"
,
"Emmaline"
,
"Emmalyn"
,
"Emmalynn"
,
"Emmalynne"
,
"Emmanuel"
,
"Emmeline"
,
"Emmer"
,
"Emmeram"
,
"Emmerich"
,
"Emmerie"
,
"Emmery"
,
"Emmet"
,
"Emmett"
,
"Emmey"
,
"Emmi"
,
"Emmie"
,
"Emmit"
,
"Emmons"
,
"Emmott"
,
"Emmuela"
,
"Emmy"
,
"Emmye"
,
"Emogene"
,
"Emory"
,
"Emrich"
,
"Emsmus"
,
"Emyle"
,
"Emylee"
,
"Enalda"
,
"Encrata"
,
"Encratia"
,
"Encratis"
,
"End"
,
"Ender"
,
"Endo"
,
"Endor"
,
"Endora"
,
"Endres"
,
"Enenstein"
,
"Eng"
,
"Engdahl"
,
"Engeddi"
,
"Engedi"
,
"Engedus"
,
"Engel"
,
"Engelbert"
,
"Engelhart"
,
"Engen"
,
"Engenia"
,
"England"
,
"Engle"
,
"Englebert"
,
"Engleman"
,
"Englis"
,
"English"
,
"Engracia"
,
"Engud"
,
"Engvall"
,
"Enid"
,
"Ennis"
,
"Eno"
,
"Enoch"
,
"Enos"
,
"Enrica"
,
"Enrichetta"
,
"Enrico"
,
"Enrika"
,
"Enrique"
,
"Enriqueta"
,
"Ensign"
,
"Ensoll"
,
"Entwistle"
,
"Enyedy"
,
"Eoin"
,
"Eolanda"
,
"Eolande"
,
"Eph"
,
"Ephraim"
,
"Ephram"
,
"Ephrayim"
,
"Ephrem"
,
"Epifano"
,
"Epner"
,
"Epp"
,
"Epperson"
,
"Eppes"
,
"Eppie"
,
"Epps"
,
"Epstein"
,
"Er"
,
"Eradis"
,
"Eran"
,
"Eras"
,
"Erasme"
,
"Erasmo"
,
"Erasmus"
,
"Erastatus"
,
"Eraste"
,
"Erastes"
,
"Erastus"
,
"Erb"
,
"Erbe"
,
"Erbes"
,
"Erda"
,
"Erdah"
,
"Erdda"
,
"Erde"
,
"Erdei"
,
"Erdman"
,
"Erdrich"
,
"Erek"
,
"Erelia"
,
"Erena"
,
"Erfert"
,
"Ergener"
,
"Erhard"
,
"Erhart"
,
"Eri"
,
"Eric"
,
"Erica"
,
"Erich"
,
"Ericha"
,
"Erick"
,
"Ericka"
,
"Ericksen"
,
"Erickson"
,
"Erida"
,
"Erie"
,
"Eriha"
,
"Erik"
,
"Erika"
,
"Erikson"
,
"Erin"
,
"Erina"
,
"Erine"
,
"Erinn"
,
"Erinna"
,
"Erkan"
,
"Erl"
,
"Erland"
,
"Erlandson"
,
"Erle"
,
"Erleena"
,
"Erlene"
,
"Erlewine"
,
"Erlin"
,
"Erlina"
,
"Erline"
,
"Erlinna"
,
"Erlond"
,
"Erma"
,
"Ermanno"
,
"Erme"
,
"Ermeena"
,
"Ermengarde"
,
"Ermentrude"
,
"Ermey"
,
"Ermin"
,
"Ermina"
,
"Ermine"
,
"Erminia"
,
"Erminie"
,
"Erminna"
,
"Ern"
,
"Erna"
,
"Ernald"
,
"Ernaldus"
,
"Ernaline"
,
"Ernest"
,
"Ernesta"
,
"Ernestine"
,
"Ernesto"
,
"Ernestus"
,
"Ernie"
,
"Ernst"
,
"Erny"
,
"Errecart"
,
"Errick"
,
"Errol"
,
"Erroll"
,
"Erskine"
,
"Ertha"
,
"Erund"
,
"Erv"
,
"ErvIn"
,
"Ervin"
,
"Ervine"
,
"Erving"
,
"Erwin"
,
"Eryn"
,
"Esau"
,
"Esbensen"
,
"Esbenshade"
,
"Esch"
,
"Esdras"
,
"Eshelman"
,
"Eshman"
,
"Eskil"
,
"Eskill"
,
"Esma"
,
"Esmaria"
,
"Esme"
,
"Esmeralda"
,
"Esmerelda"
,
"Esmerolda"
,
"Esmond"
,
"Espy"
,
"Esra"
,
"Essa"
,
"Essam"
,
"Essex"
,
"Essie"
,
"Essinger"
,
"Essy"
,
"Esta"
,
"Estas"
,
"Esteban"
,
"Estel"
,
"Estele"
,
"Estell"
,
"Estella"
,
"Estelle"
,
"Esten"
,
"Ester"
,
"Estes"
,
"Estevan"
,
"Estey"
,
"Esther"
,
"Estis"
,
"Estrella"
,
"Estrellita"
,
"Estren"
,
"Estrin"
,
"Estus"
,
"Eta"
,
"Etam"
,
"Etan"
,
"Etana"
,
"Etem"
,
"Ethan"
,
"Ethban"
,
"Ethben"
,
"Ethbin"
,
"Ethbinium"
,
"Ethbun"
,
"Ethe"
,
"Ethel"
,
"Ethelbert"
,
"Ethelda"
,
"Ethelin"
,
"Ethelind"
,
"Ethelinda"
,
"Etheline"
,
"Ethelred"
,
"Ethelstan"
,
"Ethelyn"
,
"Ethyl"
,
"Etienne"
,
"Etka"
,
"Etoile"
,
"Etom"
,
"Etra"
,
"Etrem"
,
"Etta"
,
"Ettari"
,
"Etti"
,
"Ettie"
,
"Ettinger"
,
"Ettore"
,
"Etty"
,
"Etz"
,
"Eudo"
,
"Eudoca"
,
"Eudocia"
,
"Eudora"
,
"Eudosia"
,
"Eudoxia"
,
"Euell"
,
"Eugen"
,
"Eugene"
,
"Eugenia"
,
"Eugenides"
,
"Eugenie"
,
"Eugenio"
,
"Eugenius"
,
"Eugeniusz"
,
"Eugenle"
,
"Eugine"
,
"Euh"
,
"Eula"
,
"Eulalee"
,
"Eulalia"
,
"Eulaliah"
,
"Eulalie"
,
"Eulau"
,
"Eunice"
,
"Eupheemia"
,
"Euphemia"
,
"Euphemiah"
,
"Euphemie"
,
"Euridice"
,
"Eurydice"
,
"Eusebio"
,
"Eustace"
,
"Eustache"
,
"Eustacia"
,
"Eustashe"
,
"Eustasius"
,
"Eustatius"
,
"Eustazio"
,
"Eustis"
,
"Euton"
,
"Ev"
,
"Eva"
,
"Evadne"
,
"Evadnee"
,
"Evaleen"
,
"Evalyn"
,
"Evan"
,
"Evander"
,
"Evangelia"
,
"Evangelin"
,
"Evangelina"
,
"Evangeline"
,
"Evangelist"
,
"Evania"
,
"Evanne"
,
"Evannia"
,
"Evans"
,
"Evante"
,
"Evanthe"
,
"Evars"
,
"Eve"
,
"Eveleen"
,
"Evelin"
,
"Evelina"
,
"Eveline"
,
"Evelinn"
,
"Evelunn"
,
"Evelyn"
,
"Even"
,
"Everara"
,
"Everard"
,
"Evered"
,
"Everest"
,
"Everett"
,
"Everick"
,
"Everrs"
,
"Evers"
,
"Eversole"
,
"Everson"
,
"Evetta"
,
"Evette"
,
"Evey"
,
"Evie"
,
"Evin"
,
"Evita"
,
"Evonne"
,
"Evoy"
,
"Evslin"
,
"Evvie"
,
"Evvy"
,
"Evy"
,
"Evyn"
,
"Ewald"
,
"Ewall"
,
"Ewan"
,
"Eward"
,
"Ewart"
,
"Ewell"
,
"Ewen"
,
"Ewens"
,
"Ewer"
,
"Ewold"
,
"Eyde"
,
"Eydie"
,
"Eyeleen"
,
"Eyla"
,
"Ez"
,
"Ezana"
,
"Ezar"
,
"Ezara"
,
"Ezaria"
,
"Ezarra"
,
"Ezarras"
,
"Ezechiel"
,
"Ezekiel"
,
"Ezequiel"
,
"Eziechiele"
,
"Ezmeralda"
,
"Ezra"
,
"Ezri"
,
"Ezzo"
,
"Fabe"
,
"Faber"
,
"Fabi"
,
"Fabian"
,
"Fabiano"
,
"Fabien"
,
"Fabio"
,
"Fabiola"
,
"Fabiolas"
,
"Fablan"
,
"Fabozzi"
,
"Fabri"
,
"Fabria"
,
"Fabriane"
,
"Fabrianna"
,
"Fabrianne"
,
"Fabrice"
,
"Fabrienne"
,
"Fabrin"
,
"Fabron"
,
"Fabyola"
,
"Fachan"
,
"Fachanan"
,
"Fachini"
,
"Fadden"
,
"Faden"
,
"Fadil"
,
"Fadiman"
,
"Fae"
,
"Fagaly"
,
"Fagan"
,
"Fagen"
,
"Fagin"
,
"Fahey"
,
"Fahland"
,
"Fahy"
,
"Fai"
,
"Faina"
,
"Fair"
,
"Fairbanks"
,
"Faires"
,
"Fairfax"
,
"Fairfield"
,
"Fairleigh"
,
"Fairley"
,
"Fairlie"
,
"Fairman"
,
"Fairweather"
,
"Faith"
,
"Fakieh"
,
"Falcone"
,
"Falconer"
,
"Falda"
,
"Faletti"
,
"Faline"
,
"Falito"
,
"Falk"
,
"Falkner"
,
"Fallon"
,
"Faludi"
,
"Falzetta"
,
"Fan"
,
"Fanchan"
,
"Fanchet"
,
"Fanchette"
,
"Fanchie"
,
"Fanchon"
,
"Fancie"
,
"Fancy"
,
"Fanechka"
,
"Fanestil"
,
"Fang"
,
"Fania"
,
"Fanni"
,
"Fannie"
,
"Fanning"
,
"Fanny"
,
"Fantasia"
,
"Fante"
,
"Fanya"
,
"Far"
,
"Fara"
,
"Farah"
,
"Farand"
,
"Farant"
,
"Farhi"
,
"Fari"
,
"Faria"
,
"Farica"
,
"Farika"
,
"Fariss"
,
"Farkas"
,
"Farl"
,
"Farland"
,
"Farlay"
,
"Farlee"
,
"Farleigh"
,
"Farley"
,
"Farlie"
,
"Farly"
,
"Farman"
,
"Farmann"
,
"Farmelo"
,
"Farmer"
,
"Farnham"
,
"Farnsworth"
,
"Farny"
,
"Faro"
,
"Farr"
,
"Farra"
,
"Farrah"
,
"Farrand"
,
"Farrar"
,
"Farrel"
,
"Farrell"
,
"Farrica"
,
"Farrington"
,
"Farris"
,
"Farrish"
,
"Farrison"
,
"Farro"
,
"Farron"
,
"Farrow"
,
"Faruq"
,
"Farver"
,
"Farwell"
,
"Fasano"
,
"Faso"
,
"Fassold"
,
"Fast"
,
"Fasta"
,
"Fasto"
,
"Fates"
,
"Fatima"
,
"Fatimah"
,
"Fatma"
,
"Fattal"
,
"Faubert"
,
"Faubion"
,
"Fauch"
,
"Faucher"
,
"Faulkner"
,
"Fauman"
,
"Faun"
,
"Faunia"
,
"Faunie"
,
"Faus"
,
"Faust"
,
"Fausta"
,
"Faustena"
,
"Faustina"
,
"Faustine"
,
"Faustus"
,
"Fauver"
,
"Faux"
,
"Favata"
,
"Favian"
,
"Favianus"
,
"Favien"
,
"Favin"
,
"Favrot"
,
"Fawcett"
,
"Fawcette"
,
"Fawn"
,
"Fawna"
,
"Fawne"
,
"Fawnia"
,
"Fax"
,
"Faxan"
,
"Faxen"
,
"Faxon"
,
"Faxun"
,
"Fay"
,
"Faydra"
,
"Faye"
,
"Fayette"
,
"Fayina"
,
"Fayola"
,
"Fayre"
,
"Fayth"
,
"Faythe"
,
"Fazeli"
,
"Fe"
,
"Featherstone"
,
"February"
,
"Fechter"
,
"Fedak"
,
"Federica"
,
"Federico"
,
"Fedirko"
,
"Fedora"
,
"Fee"
,
"Feeley"
,
"Feeney"
,
"Feer"
,
"Feigin"
,
"Feil"
,
"Fein"
,
"Feinberg"
,
"Feingold"
,
"Feinleib"
,
"Feinstein"
,
"Feld"
,
"Felder"
,
"Feldman"
,
"Feldstein"
,
"Feldt"
,
"Felecia"
,
"Feledy"
,
"Felic"
,
"Felicdad"
,
"Felice"
,
"Felicia"
,
"Felicidad"
,
"Felicie"
,
"Felicio"
,
"Felicity"
,
"Felicle"
,
"Felike"
,
"Feliks"
,
"Felipa"
,
"Felipe"
,
"Felise"
,
"Felisha"
,
"Felita"
,
"Felix"
,
"Feliza"
,
"Felizio"
,
"Fellner"
,
"Fellows"
,
"Felske"
,
"Felt"
,
"Felten"
,
"Feltie"
,
"Felton"
,
"Felty"
,
"Fem"
,
"Femi"
,
"Femmine"
,
"Fen"
,
"Fendig"
,
"Fenelia"
,
"Fenella"
,
"Fenn"
,
"Fennell"
,
"Fennelly"
,
"Fenner"
,
"Fennessy"
,
"Fennie"
,
"Fenny"
,
"Fenton"
,
"Fenwick"
,
"Feodor"
,
"Feodora"
,
"Feodore"
,
"Feola"
,
"Ferd"
,
"Ferde"
,
"Ferdie"
,
"Ferdinana"
,
"Ferdinand"
,
"Ferdinanda"
,
"Ferdinande"
,
"Ferdy"
,
"Fergus"
,
"Ferguson"
,
"Feriga"
,
"Ferino"
,
"Fermin"
,
"Fern"
,
"Ferna"
,
"Fernald"
,
"Fernand"
,
"Fernanda"
,
"Fernande"
,
"Fernandes"
,
"Fernandez"
,
"Fernandina"
,
"Fernando"
,
"Fernas"
,
"Ferne"
,
"Ferneau"
,
"Fernyak"
,
"Ferrand"
,
"Ferreby"
,
"Ferree"
,
"Ferrel"
,
"Ferrell"
,
"Ferren"
,
"Ferretti"
,
"Ferri"
,
"Ferrick"
,
"Ferrigno"
,
"Ferris"
,
"Ferriter"
,
"Ferro"
,
"Ferullo"
,
"Ferwerda"
,
"Festa"
,
"Festatus"
,
"Festus"
,
"Feucht"
,
"Feune"
,
"Fevre"
,
"Fey"
,
"Fi"
,
"Fia"
,
"Fiann"
,
"Fianna"
,
"Fidel"
,
"Fidela"
,
"Fidelas"
,
"Fidele"
,
"Fidelia"
,
"Fidelio"
,
"Fidelis"
,
"Fidelity"
,
"Fidellas"
,
"Fidellia"
,
"Fiden"
,
"Fidole"
,
"Fiedler"
,
"Fiedling"
,
"Field"
,
"Fielding"
,
"Fields"
,
"Fiertz"
,
"Fiester"
,
"Fife"
,
"Fifi"
,
"Fifine"
,
"Figge"
,
"Figone"
,
"Figueroa"
,
"Filbert"
,
"Filberte"
,
"Filberto"
,
"Filemon"
,
"Files"
,
"Filia"
,
"Filiano"
,
"Filide"
,
"Filip"
,
"Filipe"
,
"Filippa"
,
"Filippo"
,
"Fillander"
,
"Fillbert"
,
"Fillender"
,
"Filler"
,
"Fillian"
,
"Filmer"
,
"Filmore"
,
"Filomena"
,
"Fin"
,
"Fina"
,
"Finbar"
,
"Finbur"
,
"Findlay"
,
"Findley"
,
"Fine"
,
"Fineberg"
,
"Finegan"
,
"Finella"
,
"Fineman"
,
"Finer"
,
"Fini"
,
"Fink"
,
"Finkelstein"
,
"Finlay"
,
"Finley"
,
"Finn"
,
"Finnegan"
,
"Finnie"
,
"Finnigan"
,
"Finny"
,
"Finstad"
,
"Finzer"
,
"Fiona"
,
"Fionna"
,
"Fionnula"
,
"Fiora"
,
"Fiore"
,
"Fiorenza"
,
"Fiorenze"
,
"Firestone"
,
"Firman"
,
"Firmin"
,
"Firooc"
,
"Fisch"
,
"Fischer"
,
"Fish"
,
"Fishback"
,
"Fishbein"
,
"Fisher"
,
"Fishman"
,
"Fisk"
,
"Fiske"
,
"Fisken"
,
"Fitting"
,
"Fitton"
,
"Fitts"
,
"Fitz"
,
"Fitzger"
,
"Fitzgerald"
,
"Fitzhugh"
,
"Fitzpatrick"
,
"Fitzsimmons"
,
"Flagler"
,
"Flaherty"
,
"Flam"
,
"Flan"
,
"Flanagan"
,
"Flanders"
,
"Flanigan"
,
"Flann"
,
"Flanna"
,
"Flannery"
,
"Flatto"
,
"Flavia"
,
"Flavian"
,
"Flavio"
,
"Flavius"
,
"Fleck"
,
"Fleda"
,
"Fleece"
,
"Fleeman"
,
"Fleeta"
,
"Fleischer"
,
"Fleisher"
,
"Fleisig"
,
"Flem"
,
"Fleming"
,
"Flemings"
,
"Flemming"
,
"Flessel"
,
"Fleta"
,
"Fletch"
,
"Fletcher"
,
"Fleur"
,
"Fleurette"
,
"Flieger"
,
"Flight"
,
"Flin"
,
"Flinn"
,
"Flint"
,
"Flip"
,
"Flita"
,
"Flo"
,
"Floeter"
,
"Flor"
,
"Flora"
,
"Florance"
,
"Flore"
,
"Florella"
,
"Florence"
,
"Florencia"
,
"Florentia"
,
"Florenza"
,
"Florette"
,
"Flori"
,
"Floria"
,
"Florian"
,
"Florida"
,
"Floridia"
,
"Florie"
,
"Florin"
,
"Florina"
,
"Florinda"
,
"Florine"
,
"Florio"
,
"Floris"
,
"Floro"
,
"Florri"
,
"Florrie"
,
"Florry"
,
"Flory"
,
"Flosi"
,
"Floss"
,
"Flosser"
,
"Flossi"
,
"Flossie"
,
"Flossy"
,
"Flower"
,
"Flowers"
,
"Floyd"
,
"Flss"
,
"Flyn"
,
"Flynn"
,
"Foah"
,
"Fogarty"
,
"Fogel"
,
"Fogg"
,
"Fokos"
,
"Folberth"
,
"Foley"
,
"Folger"
,
"Follansbee"
,
"Follmer"
,
"Folly"
,
"Folsom"
,
"Fonda"
,
"Fondea"
,
"Fong"
,
"Fons"
,
"Fonseca"
,
"Fonsie"
,
"Fontana"
,
"Fontes"
,
"Fonville"
,
"Fonz"
,
"Fonzie"
,
"Foote"
,
"Forbes"
,
"Forcier"
,
"Ford"
,
"Fording"
,
"Forelli"
,
"Forest"
,
"Forester"
,
"Forkey"
,
"Forland"
,
"Forlini"
,
"Formenti"
,
"Formica"
,
"Fornof"
,
"Forras"
,
"Forrer"
,
"Forrest"
,
"Forrester"
,
"Forsta"
,
"Forster"
,
"Forsyth"
,
"Forta"
,
"Fortier"
,
"Fortin"
,
"Fortna"
,
"Fortuna"
,
"Fortunato"
,
"Fortune"
,
"Fortunia"
,
"Fortunio"
,
"Fortunna"
,
"Forward"
,
"Foscalina"
,
"Fosdick"
,
"Foskett"
,
"Fosque"
,
"Foss"
,
"Foster"
,
"Fotina"
,
"Fotinas"
,
"Fougere"
,
"Foulk"
,
"Four"
,
"Foushee"
,
"Fowkes"
,
"Fowle"
,
"Fowler"
,
"Fox"
,
"Foy"
,
"Fraase"
,
"Fradin"
,
"Frager"
,
"Frame"
,
"Fran"
,
"France"
,
"Francene"
,
"Frances"
,
"Francesca"
,
"Francesco"
,
"Franchot"
,
"Franci"
,
"Francie"
,
"Francine"
,
"Francis"
,
"Francisca"
,
"Franciscka"
,
"Francisco"
,
"Franciska"
,
"Franciskus"
,
"Franck"
,
"Francklin"
,
"Francklyn"
,
"Franckot"
,
"Francois"
,
"Francoise"
,
"Francyne"
,
"Franek"
,
"Frangos"
,
"Frank"
,
"Frankel"
,
"Frankhouse"
,
"Frankie"
,
"Franklin"
,
"Franklyn"
,
"Franky"
,
"Franni"
,
"Frannie"
,
"Franny"
,
"Frans"
,
"Fransen"
,
"Fransis"
,
"Fransisco"
,
"Frants"
,
"Frantz"
,
"Franz"
,
"Franza"
,
"Franzen"
,
"Franzoni"
,
"Frasch"
,
"Frasco"
,
"Fraser"
,
"Frasier"
,
"Frasquito"
,
"Fraya"
,
"Frayda"
,
"Frayne"
,
"Fraze"
,
"Frazer"
,
"Frazier"
,
"Frear"
,
"Freberg"
,
"Frech"
,
"Frechette"
,
"Fred"
,
"Freda"
,
"Freddi"
,
"Freddie"
,
"Freddy"
,
"Fredek"
,
"Fredel"
,
"Fredela"
,
"Fredelia"
,
"Fredella"
,
"Fredenburg"
,
"Frederic"
,
"Frederica"
,
"Frederich"
,
"Frederick"
,
"Fredericka"
,
"Frederico"
,
"Frederigo"
,
"Frederik"
,
"Frederiksen"
,
"Frederique"
,
"Fredette"
,
"Fredi"
,
"Fredia"
,
"Fredie"
,
"Fredkin"
,
"Fredra"
,
"Fredric"
,
"Fredrick"
,
"Fredrika"
,
"Free"
,
"Freeborn"
,
"Freed"
,
"Freedman"
,
"Freeland"
,
"Freeman"
,
"Freemon"
,
"Fregger"
,
"Freida"
,
"Freiman"
,
"Fremont"
,
"French"
,
"Frendel"
,
"Frentz"
,
"Frere"
,
"Frerichs"
,
"Fretwell"
,
"Freud"
,
"Freudberg"
,
"Frey"
,
"Freya"
,
"Freyah"
,
"Freytag"
,
"Frick"
,
"Fricke"
,
"Frida"
,
"Friday"
,
"Fridell"
,
"Fridlund"
,
"Fried"
,
"Frieda"
,
"Friedberg"
,
"Friede"
,
"Frieder"
,
"Friederike"
,
"Friedland"
,
"Friedlander"
,
"Friedly"
,
"Friedman"
,
"Friedrich"
,
"Friedrick"
,
"Friend"
,
"Frierson"
,
"Fries"
,
"Frisse"
,
"Frissell"
,
"Fritts"
,
"Fritz"
,
"Fritze"
,
"Fritzie"
,
"Fritzsche"
,
"Frodeen"
,
"Frodi"
,
"Frodin"
,
"Frodina"
,
"Frodine"
,
"Froehlich"
,
"Froemming"
,
"Froh"
,
"Frohman"
,
"Frohne"
,
"Frolick"
,
"Froma"
,
"Fromma"
,
"Fronia"
,
"Fronnia"
,
"Fronniah"
,
"Frost"
,
"Fruin"
,
"Frulla"
,
"Frum"
,
"Fruma"
,
"Fry"
,
"Fryd"
,
"Frydman"
,
"Frye"
,
"Frymire"
,
"Fu"
,
"Fuchs"
,
"Fugate"
,
"Fugazy"
,
"Fugere"
,
"Fuhrman"
,
"Fujio"
,
"Ful"
,
"Fulbert"
,
"Fulbright"
,
"Fulcher"
,
"Fuld"
,
"Fulks"
,
"Fuller"
,
"Fullerton"
,
"Fulmer"
,
"Fulmis"
,
"Fulton"
,
"Fulvi"
,
"Fulvia"
,
"Fulviah"
,
"Funch"
,
"Funda"
,
"Funk"
,
"Furey"
,
"Furgeson"
,
"Furie"
,
"Furiya"
,
"Furlani"
,
"Furlong"
,
"Furmark"
,
"Furnary"
,
"Furr"
,
"Furtek"
,
"Fusco"
,
"Gaal"
,
"Gabbert"
,
"Gabbey"
,
"Gabbi"
,
"Gabbie"
,
"Gabby"
,
"Gabe"
,
"Gabel"
,
"Gabey"
,
"Gabi"
,
"Gabie"
,
"Gable"
,
"Gabler"
,
"Gabor"
,
"Gabriel"
,
"Gabriela"
,
"Gabriele"
,
"Gabriell"
,
"Gabriella"
,
"Gabrielle"
,
"Gabrielli"
,
"Gabriellia"
,
"Gabriello"
,
"Gabrielson"
,
"Gabrila"
,
"Gaby"
,
"Gad"
,
"Gaddi"
,
"Gader"
,
"Gadmann"
,
"Gadmon"
,
"Gae"
,
"Gael"
,
"Gaelan"
,
"Gaeta"
,
"Gage"
,
"Gagliano"
,
"Gagne"
,
"Gagnon"
,
"Gahan"
,
"Gahl"
,
"Gaidano"
,
"Gaige"
,
"Gail"
,
"Gaile"
,
"Gaillard"
,
"Gainer"
,
"Gainor"
,
"Gaiser"
,
"Gaither"
,
"Gaivn"
,
"Gal"
,
"Gala"
,
"Galan"
,
"Galang"
,
"Galanti"
,
"Galasyn"
,
"Galatea"
,
"Galateah"
,
"Galatia"
,
"Gale"
,
"Galen"
,
"Galer"
,
"Galina"
,
"Galitea"
,
"Gall"
,
"Gallager"
,
"Gallagher"
,
"Gallard"
,
"Gallenz"
,
"Galliett"
,
"Galligan"
,
"Galloway"
,
"Gally"
,
"Galvan"
,
"Galven"
,
"Galvin"
,
"Gamages"
,
"Gamal"
,
"Gamali"
,
"Gamaliel"
,
"Gambell"
,
"Gamber"
,
"Gambrell"
,
"Gambrill"
,
"Gamin"
,
"Gan"
,
"Ganiats"
,
"Ganley"
,
"Gannes"
,
"Gannie"
,
"Gannon"
,
"Ganny"
,
"Gans"
,
"Gant"
,
"Gapin"
,
"Gar"
,
"Garald"
,
"Garate"
,
"Garaway"
,
"Garbe"
,
"Garber"
,
"Garbers"
,
"Garceau"
,
"Garcia"
,
"Garcon"
,
"Gard"
,
"Garda"
,
"Gardal"
,
"Gardas"
,
"Gardel"
,
"Gardell"
,
"Gardener"
,
"Gardia"
,
"Gardie"
,
"Gardiner"
,
"Gardner"
,
"Gardol"
,
"Gardy"
,
"Gare"
,
"Garek"
,
"Gareri"
,
"Gareth"
,
"Garett"
,
"Garey"
,
"Garfield"
,
"Garfinkel"
,
"Gargan"
,
"Garges"
,
"Garibald"
,
"Garibold"
,
"Garibull"
,
"Gariepy"
,
"Garik"
,
"Garin"
,
"Garlaand"
,
"Garlan"
,
"Garland"
,
"Garlanda"
,
"Garlen"
,
"Garlinda"
,
"Garling"
,
"Garmaise"
,
"Garneau"
,
"Garner"
,
"Garnes"
,
"Garnet"
,
"Garnett"
,
"Garnette"
,
"Garold"
,
"Garrard"
,
"Garratt"
,
"Garrek"
,
"Garret"
,
"Garreth"
,
"Garretson"
,
"Garrett"
,
"Garrick"
,
"Garrik"
,
"Garris"
,
"Garrison"
,
"Garrity"
,
"Garrot"
,
"Garrott"
,
"Garry"
,
"Garson"
,
"Garth"
,
"Garv"
,
"Garvey"
,
"Garvin"
,
"Garvy"
,
"Garwin"
,
"Garwood"
,
"Gary"
,
"Garzon"
,
"Gascony"
,
"Gaskill"
,
"Gaskin"
,
"Gaskins"
,
"Gaspar"
,
"Gaspard"
,
"Gasparo"
,
"Gasper"
,
"Gasperoni"
,
"Gass"
,
"Gasser"
,
"Gassman"
,
"Gastineau"
,
"Gaston"
,
"Gates"
,
"Gathard"
,
"Gathers"
,
"Gati"
,
"Gatian"
,
"Gatias"
,
"Gaudet"
,
"Gaudette"
,
"Gaughan"
,
"Gaul"
,
"Gauldin"
,
"Gaulin"
,
"Gault"
,
"Gaultiero"
,
"Gauntlett"
,
"Gausman"
,
"Gaut"
,
"Gautea"
,
"Gauthier"
,
"Gautier"
,
"Gautious"
,
"Gav"
,
"Gavan"
,
"Gaven"
,
"Gavette"
,
"Gavin"
,
"Gavini"
,
"Gavra"
,
"Gavrah"
,
"Gavriella"
,
"Gavrielle"
,
"Gavrila"
,
"Gavrilla"
,
"Gaw"
,
"Gawain"
,
"Gawen"
,
"Gawlas"
,
"Gay"
,
"Gaye"
,
"Gayel"
,
"Gayelord"
,
"Gayl"
,
"Gayla"
,
"Gayle"
,
"Gayleen"
,
"Gaylene"
,
"Gayler"
,
"Gaylor"
,
"Gaylord"
,
"Gayn"
,
"Gayner"
,
"Gaynor"
,
"Gazo"
,
"Gazzo"
,
"Geaghan"
,
"Gean"
,
"Geanine"
,
"Gearalt"
,
"Gearard"
,
"Gearhart"
,
"Gebelein"
,
"Gebhardt"
,
"Gebler"
,
"Geddes"
,
"Gee"
,
"Geehan"
,
"Geer"
,
"Geerts"
,
"Geesey"
,
"Gefell"
,
"Gefen"
,
"Geffner"
,
"Gehlbach"
,
"Gehman"
,
"Geibel"
,
"Geier"
,
"Geiger"
,
"Geilich"
,
"Geis"
,
"Geiss"
,
"Geithner"
,
"Gelasias"
,
"Gelasius"
,
"Gelb"
,
"Geldens"
,
"Gelhar"
,
"Geller"
,
"Gellman"
,
"Gelman"
,
"Gelya"
,
"Gemina"
,
"Gemini"
,
"Geminian"
,
"Geminius"
,
"Gemma"
,
"Gemmell"
,
"Gemoets"
,
"Gemperle"
,
"Gen"
,
"Gena"
,
"Genaro"
,
"Gene"
,
"Genesa"
,
"Genesia"
,
"Genet"
,
"Geneva"
,
"Genevieve"
,
"Genevra"
,
"Genia"
,
"Genie"
,
"Genisia"
,
"Genna"
,
"Gennaro"
,
"Genni"
,
"Gennie"
,
"Gennifer"
,
"Genny"
,
"Geno"
,
"Genovera"
,
"Gensler"
,
"Gensmer"
,
"Gent"
,
"Gentes"
,
"Gentilis"
,
"Gentille"
,
"Gentry"
,
"Genvieve"
,
"Geof"
,
"Geoff"
,
"Geoffrey"
,
"Geoffry"
,
"Georas"
,
"Geordie"
,
"Georg"
,
"George"
,
"Georgeanna"
,
"Georgeanne"
,
"Georgena"
,
"Georges"
,
"Georgeta"
,
"Georgetta"
,
"Georgette"
,
"Georgi"
,
"Georgia"
,
"Georgiana"
,
"Georgianna"
,
"Georgianne"
,
"Georgie"
,
"Georgina"
,
"Georgine"
,
"Georglana"
,
"Georgy"
,
"Ger"
,
"Geraint"
,
"Gerald"
,
"Geralda"
,
"Geraldina"
,
"Geraldine"
,
"Gerard"
,
"Gerardo"
,
"Geraud"
,
"Gerbold"
,
"Gerda"
,
"Gerdeen"
,
"Gerdi"
,
"Gerdy"
,
"Gere"
,
"Gerek"
,
"Gereld"
,
"Gereron"
,
"Gerfen"
,
"Gerge"
,
"Gerger"
,
"Gerhan"
,
"Gerhard"
,
"Gerhardine"
,
"Gerhardt"
,
"Geri"
,
"Gerianna"
,
"Gerianne"
,
"Gerick"
,
"Gerik"
,
"Gerita"
,
"Gerius"
,
"Gerkman"
,
"Gerlac"
,
"Gerladina"
,
"Germain"
,
"Germaine"
,
"German"
,
"Germana"
,
"Germann"
,
"Germano"
,
"Germaun"
,
"Germayne"
,
"Germin"
,
"Gernhard"
,
"Gerome"
,
"Gerrald"
,
"Gerrard"
,
"Gerri"
,
"Gerrie"
,
"Gerrilee"
,
"Gerrit"
,
"Gerry"
,
"Gersham"
,
"Gershom"
,
"Gershon"
,
"Gerson"
,
"Gerstein"
,
"Gerstner"
,
"Gert"
,
"Gerta"
,
"Gerti"
,
"Gertie"
,
"Gertrud"
,
"Gertruda"
,
"Gertrude"
,
"Gertrudis"
,
"Gerty"
,
"Gervais"
,
"Gervase"
,
"Gery"
,
"Gesner"
,
"Gessner"
,
"Getraer"
,
"Getter"
,
"Gettings"
,
"Gewirtz"
,
"Ghassan"
,
"Gherardi"
,
"Gherardo"
,
"Gherlein"
,
"Ghiselin"
,
"Giacamo"
,
"Giacinta"
,
"Giacobo"
,
"Giacomo"
,
"Giacopo"
,
"Giaimo"
,
"Giamo"
,
"Gian"
,
"Giana"
,
"Gianina"
,
"Gianna"
,
"Gianni"
,
"Giannini"
,
"Giarla"
,
"Giavani"
,
"Gib"
,
"Gibb"
,
"Gibbeon"
,
"Gibbie"
,
"Gibbon"
,
"Gibbons"
,
"Gibbs"
,
"Gibby"
,
"Gibe"
,
"Gibeon"
,
"Gibert"
,
"Gibrian"
,
"Gibson"
,
"Gibun"
,
"Giddings"
,
"Gide"
,
"Gideon"
,
"Giefer"
,
"Gies"
,
"Giesecke"
,
"Giess"
,
"Giesser"
,
"Giff"
,
"Giffard"
,
"Giffer"
,
"Gifferd"
,
"Giffie"
,
"Gifford"
,
"Giffy"
,
"Gigi"
,
"Giglio"
,
"Gignac"
,
"Giguere"
,
"Gil"
,
"Gilba"
,
"Gilbart"
,
"Gilbert"
,
"Gilberta"
,
"Gilberte"
,
"Gilbertina"
,
"Gilbertine"
,
"Gilberto"
,
"Gilbertson"
,
"Gilboa"
,
"Gilburt"
,
"Gilbye"
,
"Gilchrist"
,
"Gilcrest"
,
"Gilda"
,
"Gildas"
,
"Gildea"
,
"Gilder"
,
"Gildus"
,
"Gile"
,
"Gilead"
,
"Gilemette"
,
"Giles"
,
"Gilford"
,
"Gilges"
,
"Giliana"
,
"Giliane"
,
"Gill"
,
"Gillan"
,
"Gillead"
,
"Gilleod"
,
"Gilles"
,
"Gillespie"
,
"Gillett"
,
"Gilletta"
,
"Gillette"
,
"Gilli"
,
"Gilliam"
,
"Gillian"
,
"Gillie"
,
"Gilliette"
,
"Gilligan"
,
"Gillman"
,
"Gillmore"
,
"Gilly"
,
"Gilman"
,
"Gilmer"
,
"Gilmore"
,
"Gilmour"
,
"Gilpin"
,
"Gilroy"
,
"Gilson"
,
"Giltzow"
,
"Gilud"
,
"Gilus"
,
"Gimble"
,
"Gimpel"
,
"Gina"
,
"Ginder"
,
"Gine"
,
"Ginelle"
,
"Ginevra"
,
"Ginger"
,
"Gingras"
,
"Ginni"
,
"Ginnie"
,
"Ginnifer"
,
"Ginny"
,
"Gino"
,
"Ginsberg"
,
"Ginsburg"
,
"Gintz"
,
"Ginzburg"
,
"Gio"
,
"Giordano"
,
"Giorgi"
,
"Giorgia"
,
"Giorgio"
,
"Giovanna"
,
"Giovanni"
,
"Gipps"
,
"Gipson"
,
"Gipsy"
,
"Giralda"
,
"Giraldo"
,
"Girand"
,
"Girard"
,
"Girardi"
,
"Girardo"
,
"Giraud"
,
"Girhiny"
,
"Girish"
,
"Girovard"
,
"Girvin"
,
"Gisela"
,
"Giselbert"
,
"Gisele"
,
"Gisella"
,
"Giselle"
,
"Gish"
,
"Gisser"
,
"Gitel"
,
"Githens"
,
"Gitlow"
,
"Gitt"
,
"Gittel"
,
"Gittle"
,
"Giuditta"
,
"Giule"
,
"Giulia"
,
"Giuliana"
,
"Giulietta"
,
"Giulio"
,
"Giuseppe"
,
"Giustina"
,
"Giustino"
,
"Giusto"
,
"Given"
,
"Giverin"
,
"Giza"
,
"Gizela"
,
"Glaab"
,
"Glad"
,
"Gladdie"
,
"Gladdy"
,
"Gladi"
,
"Gladine"
,
"Gladis"
,
"Gladstone"
,
"Gladwin"
,
"Gladys"
,
"Glanti"
,
"Glantz"
,
"Glanville"
,
"Glarum"
,
"Glaser"
,
"Glasgo"
,
"Glass"
,
"Glassco"
,
"Glassman"
,
"Glaudia"
,
"Glavin"
,
"Gleason"
,
"Gleda"
,
"Gleeson"
,
"Gleich"
,
"Glen"
,
"Glenda"
,
"Glenden"
,
"Glendon"
,
"Glenine"
,
"Glenn"
,
"Glenna"
,
"Glennie"
,
"Glennis"
,
"Glennon"
,
"Glialentn"
,
"Glick"
,
"Glimp"
,
"Glinys"
,
"Glogau"
,
"Glori"
,
"Gloria"
,
"Gloriana"
,
"Gloriane"
,
"Glorianna"
,
"Glory"
,
"Glover"
,
"Glovsky"
,
"Gluck"
,
"Glyn"
,
"Glynas"
,
"Glynda"
,
"Glynias"
,
"Glynis"
,
"Glynn"
,
"Glynnis"
,
"Gmur"
,
"Gnni"
,
"Goar"
,
"Goat"
,
"Gobert"
,
"God"
,
"Goda"
,
"Godard"
,
"Godart"
,
"Godbeare"
,
"Godber"
,
"Goddard"
,
"Goddart"
,
"Godden"
,
"Godderd"
,
"Godding"
,
"Goddord"
,
"Godewyn"
,
"Godfree"
,
"Godfrey"
,
"Godfry"
,
"Godiva"
,
"Godliman"
,
"Godred"
,
"Godric"
,
"Godrich"
,
"Godspeed"
,
"Godwin"
,
"Goebel"
,
"Goeger"
,
"Goer"
,
"Goerke"
,
"Goeselt"
,
"Goetz"
,
"Goff"
,
"Goggin"
,
"Goines"
,
"Gokey"
,
"Golanka"
,
"Gold"
,
"Golda"
,
"Goldarina"
,
"Goldberg"
,
"Golden"
,
"Goldenberg"
,
"Goldfarb"
,
"Goldfinch"
,
"Goldi"
,
"Goldia"
,
"Goldie"
,
"Goldin"
,
"Goldina"
,
"Golding"
,
"Goldman"
,
"Goldner"
,
"Goldshell"
,
"Goldshlag"
,
"Goldsmith"
,
"Goldstein"
,
"Goldston"
,
"Goldsworthy"
,
"Goldwin"
,
"Goldy"
,
"Goles"
,
"Golightly"
,
"Gollin"
,
"Golliner"
,
"Golter"
,
"Goltz"
,
"Golub"
,
"Gomar"
,
"Gombach"
,
"Gombosi"
,
"Gomer"
,
"Gomez"
,
"Gona"
,
"Gonagle"
,
"Gone"
,
"Gonick"
,
"Gonnella"
,
"Gonroff"
,
"Gonsalve"
,
"Gonta"
,
"Gonyea"
,
"Gonzales"
,
"Gonzalez"
,
"Gonzalo"
,
"Goober"
,
"Good"
,
"Goodard"
,
"Goodden"
,
"Goode"
,
"Goodhen"
,
"Goodill"
,
"Goodkin"
,
"Goodman"
,
"Goodrich"
,
"Goodrow"
,
"Goodson"
,
"Goodspeed"
,
"Goodwin"
,
"Goody"
,
"Goodyear"
,
"Googins"
,
"Gora"
,
"Goran"
,
"Goraud"
,
"Gord"
,
"Gordan"
,
"Gorden"
,
"Gordie"
,
"Gordon"
,
"Gordy"
,
"Gore"
,
"Goren"
,
"Gorey"
,
"Gorga"
,
"Gorges"
,
"Gorlicki"
,
"Gorlin"
,
"Gorman"
,
"Gorrian"
,
"Gorrono"
,
"Gorski"
,
"Gorton"
,
"Gosnell"
,
"Gosney"
,
"Goss"
,
"Gosselin"
,
"Gosser"
,
"Gotcher"
,
"Goth"
,
"Gothar"
,
"Gothard"
,
"Gothart"
,
"Gothurd"
,
"Goto"
,
"Gottfried"
,
"Gotthard"
,
"Gotthelf"
,
"Gottlieb"
,
"Gottuard"
,
"Gottwald"
,
"Gough"
,
"Gould"
,
"Goulden"
,
"Goulder"
,
"Goulet"
,
"Goulette"
,
"Gove"
,
"Gow"
,
"Gower"
,
"Gowon"
,
"Gowrie"
,
"Graaf"
,
"Grace"
,
"Graces"
,
"Gracia"
,
"Gracie"
,
"Gracye"
,
"Gradeigh"
,
"Gradey"
,
"Grados"
,
"Grady"
,
"Grae"
,
"Graehl"
,
"Graehme"
,
"Graeme"
,
"Graf"
,
"Graff"
,
"Graham"
,
"Graig"
,
"Grail"
,
"Gram"
,
"Gran"
,
"Grand"
,
"Grane"
,
"Graner"
,
"Granese"
,
"Grange"
,
"Granger"
,
"Grani"
,
"Grania"
,
"Graniah"
,
"Graniela"
,
"Granlund"
,
"Grannia"
,
"Granniah"
,
"Grannias"
,
"Grannie"
,
"Granny"
,
"Granoff"
,
"Grant"
,
"Grantham"
,
"Granthem"
,
"Grantland"
,
"Grantley"
,
"Granville"
,
"Grassi"
,
"Grata"
,
"Grath"
,
"Grati"
,
"Gratia"
,
"Gratiana"
,
"Gratianna"
,
"Gratt"
,
"Graubert"
,
"Gravante"
,
"Graves"
,
"Gray"
,
"Graybill"
,
"Grayce"
,
"Grayson"
,
"Grazia"
,
"Greabe"
,
"Grearson"
,
"Gredel"
,
"Greeley"
,
"Green"
,
"Greenberg"
,
"Greenburg"
,
"Greene"
,
"Greenebaum"
,
"Greenes"
,
"Greenfield"
,
"Greenland"
,
"Greenleaf"
,
"Greenlee"
,
"Greenman"
,
"Greenquist"
,
"Greenstein"
,
"Greenwald"
,
"Greenwell"
,
"Greenwood"
,
"Greer"
,
"Greerson"
,
"Greeson"
,
"Grefe"
,
"Grefer"
,
"Greff"
,
"Greg"
,
"Grega"
,
"Gregg"
,
"Greggory"
,
"Greggs"
,
"Gregoire"
,
"Gregoor"
,
"Gregor"
,
"Gregorio"
,
"Gregorius"
,
"Gregory"
,
"Gregrory"
,
"Gregson"
,
"Greiner"
,
"Grekin"
,
"Grenier"
,
"Grenville"
,
"Gresham"
,
"Greta"
,
"Gretal"
,
"Gretchen"
,
"Grete"
,
"Gretel"
,
"Grethel"
,
"Gretna"
,
"Gretta"
,
"Grevera"
,
"Grew"
,
"Grewitz"
,
"Grey"
,
"Greyso"
,
"Greyson"
,
"Greysun"
,
"Grider"
,
"Gridley"
,
"Grier"
,
"Grieve"
,
"Griff"
,
"Griffie"
,
"Griffin"
,
"Griffis"
,
"Griffith"
,
"Griffiths"
,
"Griffy"
,
"Griggs"
,
"Grigson"
,
"Grim"
,
"Grimaldi"
,
"Grimaud"
,
"Grimbal"
,
"Grimbald"
,
"Grimbly"
,
"Grimes"
,
"Grimona"
,
"Grimonia"
,
"Grindlay"
,
"Grindle"
,
"Grinnell"
,
"Gris"
,
"Griselda"
,
"Griseldis"
,
"Grishilda"
,
"Grishilde"
,
"Grissel"
,
"Grissom"
,
"Gristede"
,
"Griswold"
,
"Griz"
,
"Grizel"
,
"Grizelda"
,
"Groark"
,
"Grobe"
,
"Grochow"
,
"Grodin"
,
"Grof"
,
"Grogan"
,
"Groh"
,
"Gromme"
,
"Grondin"
,
"Gronseth"
,
"Groome"
,
"Groos"
,
"Groot"
,
"Grory"
,
"Grosberg"
,
"Groscr"
,
"Grose"
,
"Grosmark"
,
"Gross"
,
"Grossman"
,
"Grosvenor"
,
"Grosz"
,
"Grote"
,
"Grounds"
,
"Grous"
,
"Grove"
,
"Groveman"
,
"Grover"
,
"Groves"
,
"Grubb"
,
"Grube"
,
"Gruber"
,
"Grubman"
,
"Gruchot"
,
"Grunberg"
,
"Grunenwald"
,
"Grussing"
,
"Gruver"
,
"Gschu"
,
"Guadalupe"
,
"Gualterio"
,
"Gualtiero"
,
"Guarino"
,
"Gudren"
,
"Gudrin"
,
"Gudrun"
,
"Guendolen"
,
"Guenevere"
,
"Guenna"
,
"Guenzi"
,
"Guerin"
,
"Guerra"
,
"Guevara"
,
"Guglielma"
,
"Guglielmo"
,
"Gui"
,
"Guibert"
,
"Guido"
,
"Guidotti"
,
"Guilbert"
,
"Guild"
,
"Guildroy"
,
"Guillaume"
,
"Guillema"
,
"Guillemette"
,
"Guillermo"
,
"Guimar"
,
"Guimond"
,
"Guinevere"
,
"Guinn"
,
"Guinna"
,
"Guise"
,
"Gujral"
,
"Gula"
,
"Gulgee"
,
"Gulick"
,
"Gun"
,
"Gunar"
,
"Gunas"
,
"Gundry"
,
"Gunilla"
,
"Gunn"
,
"Gunnar"
,
"Gunner"
,
"Gunning"
,
"Guntar"
,
"Gunter"
,
"Gunthar"
,
"Gunther"
,
"Gunzburg"
,
"Gupta"
,
"Gurango"
,
"Gurevich"
,
"Guria"
,
"Gurias"
,
"Gurl"
,
"Gurney"
,
"Gurolinick"
,
"Gurtner"
,
"Gus"
,
"Gusba"
,
"Gusella"
,
"Guss"
,
"Gussi"
,
"Gussie"
,
"Gussman"
,
"Gussy"
,
"Gusta"
,
"Gustaf"
,
"Gustafson"
,
"Gustafsson"
,
"Gustav"
,
"Gustave"
,
"Gustavo"
,
"Gustavus"
,
"Gusti"
,
"Gustie"
,
"Gustin"
,
"Gusty"
,
"Gut"
,
"Guthrey"
,
"Guthrie"
,
"Guthry"
,
"Gutow"
,
"Guttery"
,
"Guy"
,
"Guyer"
,
"Guyon"
,
"Guzel"
,
"Gwen"
,
"Gwendolen"
,
"Gwendolin"
,
"Gwendolyn"
,
"Gweneth"
,
"Gwenette"
,
"Gwenn"
,
"Gwenneth"
,
"Gwenni"
,
"Gwennie"
,
"Gwenny"
,
"Gwenora"
,
"Gwenore"
,
"Gwyn"
,
"Gwyneth"
,
"Gwynne"
,
"Gyasi"
,
"Gyatt"
,
"Gyimah"
,
"Gylys"
,
"Gypsie"
,
"Gypsy"
,
"Gytle"
,
"Ha"
,
"Haag"
,
"Haakon"
,
"Haas"
,
"Haase"
,
"Haberman"
,
"Hach"
,
"Hachman"
,
"Hachmann"
,
"Hachmin"
,
"Hackathorn"
,
"Hacker"
,
"Hackett"
,
"Hackney"
,
"Had"
,
"Haddad"
,
"Hadden"
,
"Haden"
,
"Hadik"
,
"Hadlee"
,
"Hadleigh"
,
"Hadley"
,
"Hadria"
,
"Hadrian"
,
"Hadsall"
,
"Hadwin"
,
"Hadwyn"
,
"Haeckel"
,
"Haerle"
,
"Haerr"
,
"Haff"
,
"Hafler"
,
"Hagai"
,
"Hagan"
,
"Hagar"
,
"Hagen"
,
"Hagerman"
,
"Haggai"
,
"Haggar"
,
"Haggerty"
,
"Haggi"
,
"Hagi"
,
"Hagood"
,
"Hahn"
,
"Hahnert"
,
"Hahnke"
,
"Haida"
,
"Haig"
,
"Haile"
,
"Hailee"
,
"Hailey"
,
"Haily"
,
"Haim"
,
"Haimes"
,
"Haines"
,
"Hak"
,
"Hakan"
,
"Hake"
,
"Hakeem"
,
"Hakim"
,
"Hako"
,
"Hakon"
,
"Hal"
,
"Haland"
,
"Halbeib"
,
"Halbert"
,
"Halda"
,
"Haldan"
,
"Haldane"
,
"Haldas"
,
"Haldeman"
,
"Halden"
,
"Haldes"
,
"Haldi"
,
"Haldis"
,
"Hale"
,
"Haleigh"
,
"Haletky"
,
"Haletta"
,
"Halette"
,
"Haley"
,
"Halfdan"
,
"Halfon"
,
"Halford"
,
"Hali"
,
"Halie"
,
"Halima"
,
"Halimeda"
,
"Hall"
,
"Halla"
,
"Hallagan"
,
"Hallam"
,
"Halland"
,
"Halle"
,
"Hallee"
,
"Hallerson"
,
"Hallett"
,
"Hallette"
,
"Halley"
,
"Halli"
,
"Halliday"
,
"Hallie"
,
"Hallock"
,
"Hallsy"
,
"Hallvard"
,
"Hally"
,
"Halona"
,
"Halonna"
,
"Halpern"
,
"Halsey"
,
"Halstead"
,
"Halsted"
,
"Halsy"
,
"Halvaard"
,
"Halverson"
,
"Ham"
,
"Hama"
,
"Hamachi"
,
"Hamal"
,
"Haman"
,
"Hamann"
,
"Hambley"
,
"Hamburger"
,
"Hamel"
,
"Hamer"
,
"Hamford"
,
"Hamforrd"
,
"Hamfurd"
,
"Hamid"
,
"Hamil"
,
"Hamilton"
,
"Hamish"
,
"Hamlani"
,
"Hamlen"
,
"Hamlet"
,
"Hamlin"
,
"Hammad"
,
"Hammel"
,
"Hammer"
,
"Hammerskjold"
,
"Hammock"
,
"Hammond"
,
"Hamner"
,
"Hamnet"
,
"Hamo"
,
"Hamon"
,
"Hampton"
,
"Hamrah"
,
"Hamrnand"
,
"Han"
,
"Hana"
,
"Hanae"
,
"Hanafee"
,
"Hanako"
,
"Hanan"
,
"Hance"
,
"Hancock"
,
"Handal"
,
"Handbook"
,
"Handel"
,
"Handler"
,
"Hands"
,
"Handy"
,
"Haney"
,
"Hanford"
,
"Hanforrd"
,
"Hanfurd"
,
"Hank"
,
"Hankins"
,
"Hanleigh"
,
"Hanley"
,
"Hanna"
,
"Hannah"
,
"Hannan"
,
"Hanni"
,
"Hannibal"
,
"Hannie"
,
"Hannis"
,
"Hannon"
,
"Hannover"
,
"Hannus"
,
"Hanny"
,
"Hanover"
,
"Hans"
,
"Hanschen"
,
"Hansel"
,
"Hanselka"
,
"Hansen"
,
"Hanser"
,
"Hanshaw"
,
"Hansiain"
,
"Hanson"
,
"Hanus"
,
"Hanway"
,
"Hanzelin"
,
"Happ"
,
"Happy"
,
"Hapte"
,
"Hara"
,
"Harald"
,
"Harbard"
,
"Harberd"
,
"Harbert"
,
"Harbird"
,
"Harbison"
,
"Harbot"
,
"Harbour"
,
"Harcourt"
,
"Hardan"
,
"Harday"
,
"Hardden"
,
"Hardej"
,
"Harden"
,
"Hardi"
,
"Hardie"
,
"Hardigg"
,
"Hardin"
,
"Harding"
,
"Hardman"
,
"Hardner"
,
"Hardunn"
,
"Hardwick"
,
"Hardy"
,
"Hare"
,
"Harelda"
,
"Harewood"
,
"Harhay"
,
"Harilda"
,
"Harim"
,
"Harl"
,
"Harlamert"
,
"Harlan"
,
"Harland"
,
"Harle"
,
"Harleigh"
,
"Harlen"
,
"Harlene"
,
"Harley"
,
"Harli"
,
"Harlie"
,
"Harlin"
,
"Harlow"
,
"Harman"
,
"Harmaning"
,
"Harmon"
,
"Harmonia"
,
"Harmonie"
,
"Harmony"
,
"Harms"
,
"Harned"
,
"Harneen"
,
"Harness"
,
"Harod"
,
"Harold"
,
"Harolda"
,
"Haroldson"
,
"Haroun"
,
"Harp"
,
"Harper"
,
"Harpole"
,
"Harpp"
,
"Harragan"
,
"Harrell"
,
"Harri"
,
"Harrie"
,
"Harriet"
,
"Harriett"
,
"Harrietta"
,
"Harriette"
,
"Harriman"
,
"Harrington"
,
"Harriot"
,
"Harriott"
,
"Harris"
,
"Harrison"
,
"Harrod"
,
"Harrow"
,
"Harrus"
,
"Harry"
,
"Harshman"
,
"Harsho"
,
"Hart"
,
"Harte"
,
"Hartfield"
,
"Hartill"
,
"Hartley"
,
"Hartman"
,
"Hartmann"
,
"Hartmunn"
,
"Hartnett"
,
"Harts"
,
"Hartwell"
,
"Harty"
,
"Hartzel"
,
"Hartzell"
,
"Hartzke"
,
"Harv"
,
"Harvard"
,
"Harve"
,
"Harvey"
,
"Harvie"
,
"Harvison"
,
"Harwell"
,
"Harwill"
,
"Harwilll"
,
"Harwin"
,
"Hasan"
,
"Hasen"
,
"Hasheem"
,
"Hashim"
,
"Hashimoto"
,
"Hashum"
,
"Hasin"
,
"Haskel"
,
"Haskell"
,
"Haskins"
,
"Haslam"
,
"Haslett"
,
"Hasseman"
,
"Hassett"
,
"Hassi"
,
"Hassin"
,
"Hastie"
,
"Hastings"
,
"Hasty"
,
"Haswell"
,
"Hatch"
,
"Hatcher"
,
"Hatfield"
,
"Hathaway"
,
"Hathcock"
,
"Hatti"
,
"Hattie"
,
"Hatty"
,
"Hau"
,
"Hauck"
,
"Hauge"
,
"Haugen"
,
"Hauger"
,
"Haughay"
,
"Haukom"
,
"Hauser"
,
"Hausmann"
,
"Hausner"
,
"Havard"
,
"Havelock"
,
"Haveman"
,
"Haven"
,
"Havener"
,
"Havens"
,
"Havstad"
,
"Hawger"
,
"Hawk"
,
"Hawken"
,
"Hawker"
,
"Hawkie"
,
"Hawkins"
,
"Hawley"
,
"Hawthorn"
,
"Hax"
,
"Hay"
,
"Haya"
,
"Hayashi"
,
"Hayden"
,
"Haydon"
,
"Haye"
,
"Hayes"
,
"Hayley"
,
"Hayman"
,
"Haymes"
,
"Haymo"
,
"Hayne"
,
"Haynes"
,
"Haynor"
,
"Hayott"
,
"Hays"
,
"Hayse"
,
"Hayton"
,
"Hayward"
,
"Haywood"
,
"Hayyim"
,
"Hazaki"
,
"Hazard"
,
"Haze"
,
"Hazeghi"
,
"Hazel"
,
"Hazelton"
,
"Hazem"
,
"Hazen"
,
"Hazlett"
,
"Hazlip"
,
"Head"
,
"Heady"
,
"Healey"
,
"Healion"
,
"Heall"
,
"Healy"
,
"Heaps"
,
"Hearn"
,
"Hearsh"
,
"Heater"
,
"Heath"
,
"Heathcote"
,
"Heather"
,
"Hebbe"
,
"Hebe"
,
"Hebel"
,
"Heber"
,
"Hebert"
,
"Hebner"
,
"Hebrew"
,
"Hecht"
,
"Heck"
,
"Hecker"
,
"Hecklau"
,
"Hector"
,
"Heda"
,
"Hedberg"
,
"Hedda"
,
"Heddi"
,
"Heddie"
,
"Heddy"
,
"Hedelman"
,
"Hedgcock"
,
"Hedges"
,
"Hedi"
,
"Hedley"
,
"Hedva"
,
"Hedvah"
,
"Hedve"
,
"Hedveh"
,
"Hedvig"
,
"Hedvige"
,
"Hedwig"
,
"Hedwiga"
,
"Hedy"
,
"Heeley"
,
"Heer"
,
"Heffron"
,
"Hefter"
,
"Hegarty"
,
"Hege"
,
"Heger"
,
"Hegyera"
,
"Hehre"
,
"Heid"
,
"Heida"
,
"Heidi"
,
"Heidie"
,
"Heidt"
,
"Heidy"
,
"Heigho"
,
"Heigl"
,
"Heilman"
,
"Heilner"
,
"Heim"
,
"Heimer"
,
"Heimlich"
,
"Hein"
,
"Heindrick"
,
"Heiner"
,
"Heiney"
,
"Heinrich"
,
"Heinrick"
,
"Heinrik"
,
"Heinrike"
,
"Heins"
,
"Heintz"
,
"Heise"
,
"Heisel"
,
"Heiskell"
,
"Heisser"
,
"Hekker"
,
"Hekking"
,
"Helaina"
,
"Helaine"
,
"Helali"
,
"Helban"
,
"Helbon"
,
"Helbona"
,
"Helbonia"
,
"Helbonna"
,
"Helbonnah"
,
"Helbonnas"
,
"Held"
,
"Helen"
,
"Helena"
,
"Helene"
,
"Helenka"
,
"Helfand"
,
"Helfant"
,
"Helga"
,
"Helge"
,
"Helgeson"
,
"Hellene"
,
"Heller"
,
"Helli"
,
"Hellman"
,
"Helm"
,
"Helman"
,
"Helmer"
,
"Helms"
,
"Helmut"
,
"Heloise"
,
"Helprin"
,
"Helsa"
,
"Helse"
,
"Helsell"
,
"Helsie"
,
"Helve"
,
"Helyn"
,
"Heman"
,
"Hembree"
,
"Hemingway"
,
"Hemminger"
,
"Hemphill"
,
"Hen"
,
"Hendel"
,
"Henden"
,
"Henderson"
,
"Hendon"
,
"Hendren"
,
"Hendrick"
,
"Hendricks"
,
"Hendrickson"
,
"Hendrik"
,
"Hendrika"
,
"Hendrix"
,
"Hendry"
,
"Henebry"
,
"Heng"
,
"Hengel"
,
"Henghold"
,
"Henig"
,
"Henigman"
,
"Henka"
,
"Henke"
,
"Henleigh"
,
"Henley"
,
"Henn"
,
"Hennahane"
,
"Hennebery"
,
"Hennessey"
,
"Hennessy"
,
"Henni"
,
"Hennie"
,
"Henning"
,
"Henri"
,
"Henricks"
,
"Henrie"
,
"Henrieta"
,
"Henrietta"
,
"Henriette"
,
"Henriha"
,
"Henrik"
,
"Henrion"
,
"Henrique"
,
"Henriques"
,
"Henry"
,
"Henryetta"
,
"Henryk"
,
"Henryson"
,
"Henson"
,
"Hentrich"
,
"Hephzibah"
,
"Hephzipa"
,
"Hephzipah"
,
"Heppman"
,
"Hepsiba"
,
"Hepsibah"
,
"Hepza"
,
"Hepzi"
,
"Hera"
,
"Herald"
,
"Herb"
,
"Herbert"
,
"Herbie"
,
"Herbst"
,
"Herby"
,
"Herc"
,
"Hercule"
,
"Hercules"
,
"Herculie"
,
"Hereld"
,
"Heriberto"
,
"Heringer"
,
"Herm"
,
"Herman"
,
"Hermann"
,
"Hermes"
,
"Hermia"
,
"Hermie"
,
"Hermina"
,
"Hermine"
,
"Herminia"
,
"Hermione"
,
"Hermon"
,
"Hermosa"
,
"Hermy"
,
"Hernandez"
,
"Hernando"
,
"Hernardo"
,
"Herod"
,
"Herodias"
,
"Herold"
,
"Heron"
,
"Herr"
,
"Herra"
,
"Herrah"
,
"Herrera"
,
"Herrick"
,
"Herries"
,
"Herring"
,
"Herrington"
,
"Herriott"
,
"Herrle"
,
"Herrmann"
,
"Herrod"
,
"Hersch"
,
"Herschel"
,
"Hersh"
,
"Hershel"
,
"Hershell"
,
"Herson"
,
"Herstein"
,
"Herta"
,
"Hertberg"
,
"Hertha"
,
"Hertz"
,
"Hertzfeld"
,
"Hertzog"
,
"Herv"
,
"Herve"
,
"Hervey"
,
"Herwick"
,
"Herwig"
,
"Herwin"
,
"Herzberg"
,
"Herzel"
,
"Herzen"
,
"Herzig"
,
"Herzog"
,
"Hescock"
,
"Heshum"
,
"Hesketh"
,
"Hesky"
,
"Hesler"
,
"Hesper"
,
"Hess"
,
"Hessler"
,
"Hessney"
,
"Hesta"
,
"Hester"
,
"Hesther"
,
"Hestia"
,
"Heti"
,
"Hett"
,
"Hetti"
,
"Hettie"
,
"Hetty"
,
"Heurlin"
,
"Heuser"
,
"Hew"
,
"Hewart"
,
"Hewe"
,
"Hewes"
,
"Hewet"
,
"Hewett"
,
"Hewie"
,
"Hewitt"
,
"Hey"
,
"Heyde"
,
"Heydon"
,
"Heyer"
,
"Heyes"
,
"Heyman"
,
"Heymann"
,
"Heyward"
,
"Heywood"
,
"Hezekiah"
,
"Hi"
,
"Hibben"
,
"Hibbert"
,
"Hibbitts"
,
"Hibbs"
,
"Hickey"
,
"Hickie"
,
"Hicks"
,
"Hidie"
,
"Hieronymus"
,
"Hiett"
,
"Higbee"
,
"Higginbotham"
,
"Higgins"
,
"Higginson"
,
"Higgs"
,
"High"
,
"Highams"
,
"Hightower"
,
"Higinbotham"
,
"Higley"
,
"Hijoung"
,
"Hike"
,
"Hilaire"
,
"Hilar"
,
"Hilaria"
,
"Hilario"
,
"Hilarius"
,
"Hilary"
,
"Hilbert"
,
"Hild"
,
"Hilda"
,
"Hildagard"
,
"Hildagarde"
,
"Hilde"
,
"Hildebrandt"
,
"Hildegaard"
,
"Hildegard"
,
"Hildegarde"
,
"Hildick"
,
"Hildie"
,
"Hildy"
,
"Hilel"
,
"Hill"
,
"Hillard"
,
"Hillari"
,
"Hillary"
,
"Hilleary"
,
"Hillegass"
,
"Hillel"
,
"Hillell"
,
"Hiller"
,
"Hillery"
,
"Hillhouse"
,
"Hilliard"
,
"Hilliary"
,
"Hillie"
,
"Hillier"
,
"Hillinck"
,
"Hillman"
,
"Hills"
,
"Hilly"
,
"Hillyer"
,
"Hiltan"
,
"Hilten"
,
"Hiltner"
,
"Hilton"
,
"Him"
,
"Hime"
,
"Himelman"
,
"Hinch"
,
"Hinckley"
,
"Hinda"
,
"Hindorff"
,
"Hindu"
,
"Hines"
,
"Hinkel"
,
"Hinkle"
,
"Hinman"
,
"Hinson"
,
"Hintze"
,
"Hinze"
,
"Hippel"
,
"Hirai"
,
"Hiram"
,
"Hirasuna"
,
"Hiro"
,
"Hiroko"
,
"Hiroshi"
,
"Hirsch"
,
"Hirschfeld"
,
"Hirsh"
,
"Hirst"
,
"Hirz"
,
"Hirza"
,
"Hisbe"
,
"Hitchcock"
,
"Hite"
,
"Hitoshi"
,
"Hitt"
,
"Hittel"
,
"Hizar"
,
"Hjerpe"
,
"Hluchy"
,
"Ho"
,
"Hoag"
,
"Hoagland"
,
"Hoang"
,
"Hoashis"
,
"Hoban"
,
"Hobard"
,
"Hobart"
,
"Hobbie"
,
"Hobbs"
,
"Hobey"
,
"Hobie"
,
"Hochman"
,
"Hock"
,
"Hocker"
,
"Hodess"
,
"Hodge"
,
"Hodges"
,
"Hodgkinson"
,
"Hodgson"
,
"Hodosh"
,
"Hoebart"
,
"Hoeg"
,
"Hoehne"
,
"Hoem"
,
"Hoenack"
,
"Hoes"
,
"Hoeve"
,
"Hoffarth"
,
"Hoffer"
,
"Hoffert"
,
"Hoffman"
,
"Hoffmann"
,
"Hofmann"
,
"Hofstetter"
,
"Hogan"
,
"Hogarth"
,
"Hogen"
,
"Hogg"
,
"Hogle"
,
"Hogue"
,
"Hoi"
,
"Hoisch"
,
"Hokanson"
,
"Hola"
,
"Holbrook"
,
"Holbrooke"
,
"Holcman"
,
"Holcomb"
,
"Holden"
,
"Holder"
,
"Holds"
,
"Hole"
,
"Holey"
,
"Holladay"
,
"Hollah"
,
"Holland"
,
"Hollander"
,
"Holle"
,
"Hollenbeck"
,
"Holleran"
,
"Hollerman"
,
"Holli"
,
"Hollie"
,
"Hollinger"
,
"Hollingsworth"
,
"Hollington"
,
"Hollis"
,
"Hollister"
,
"Holloway"
,
"Holly"
,
"Holly-Anne"
,
"Hollyanne"
,
"Holman"
,
"Holmann"
,
"Holmen"
,
"Holmes"
,
"Holms"
,
"Holmun"
,
"Holna"
,
"Holofernes"
,
"Holsworth"
,
"Holt"
,
"Holton"
,
"Holtorf"
,
"Holtz"
,
"Holub"
,
"Holzman"
,
"Homans"
,
"Home"
,
"Homer"
,
"Homere"
,
"Homerus"
,
"Homovec"
,
"Honan"
,
"Honebein"
,
"Honey"
,
"Honeyman"
,
"Honeywell"
,
"Hong"
,
"Honig"
,
"Honna"
,
"Honniball"
,
"Honor"
,
"Honora"
,
"Honoria"
,
"Honorine"
,
"Hoo"
,
"Hooge"
,
"Hook"
,
"Hooke"
,
"Hooker"
,
"Hoon"
,
"Hoopen"
,
"Hooper"
,
"Hoopes"
,
"Hootman"
,
"Hoover"
,
"Hope"
,
"Hopfinger"
,
"Hopkins"
,
"Hoppe"
,
"Hopper"
,
"Horace"
,
"Horacio"
,
"Horan"
,
"Horatia"
,
"Horatio"
,
"Horatius"
,
"Horbal"
,
"Horgan"
,
"Horick"
,
"Horlacher"
,
"Horn"
,
"Horne"
,
"Horner"
,
"Hornstein"
,
"Horodko"
,
"Horowitz"
,
"Horsey"
,
"Horst"
,
"Hort"
,
"Horten"
,
"Hortensa"
,
"Hortense"
,
"Hortensia"
,
"Horter"
,
"Horton"
,
"Horvitz"
,
"Horwath"
,
"Horwitz"
,
"Hosbein"
,
"Hose"
,
"Hosea"
,
"Hoseia"
,
"Hosfmann"
,
"Hoshi"
,
"Hoskinson"
,
"Hospers"
,
"Hotchkiss"
,
"Hotze"
,
"Hough"
,
"Houghton"
,
"Houlberg"
,
"Hound"
,
"Hourigan"
,
"Hourihan"
,
"Housen"
,
"Houser"
,
"Houston"
,
"Housum"
,
"Hovey"
,
"How"
,
"Howard"
,
"Howarth"
,
"Howe"
,
"Howell"
,
"Howenstein"
,
"Howes"
,
"Howey"
,
"Howie"
,
"Howlan"
,
"Howland"
,
"Howlend"
,
"Howlond"
,
"Howlyn"
,
"Howund"
,
"Howzell"
,
"Hoxie"
,
"Hoxsie"
,
"Hoy"
,
"Hoye"
,
"Hoyt"
,
"Hrutkay"
,
"Hsu"
,
"Hu"
,
"Huai"
,
"Huan"
,
"Huang"
,
"Huba"
,
"Hubbard"
,
"Hubble"
,
"Hube"
,
"Huber"
,
"Huberman"
,
"Hubert"
,
"Huberto"
,
"Huberty"
,
"Hubey"
,
"Hubie"
,
"Hubing"
,
"Hubsher"
,
"Huckaby"
,
"Huda"
,
"Hudgens"
,
"Hudis"
,
"Hudnut"
,
"Hudson"
,
"Huebner"
,
"Huei"
,
"Huesman"
,
"Hueston"
,
"Huey"
,
"Huff"
,
"Hufnagel"
,
"Huggins"
,
"Hugh"
,
"Hughes"
,
"Hughett"
,
"Hughie"
,
"Hughmanick"
,
"Hugibert"
,
"Hugo"
,
"Hugon"
,
"Hugues"
,
"Hui"
,
"Hujsak"
,
"Hukill"
,
"Hulbard"
,
"Hulbert"
,
"Hulbig"
,
"Hulburt"
,
"Hulda"
,
"Huldah"
,
"Hulen"
,
"Hull"
,
"Hullda"
,
"Hultgren"
,
"Hultin"
,
"Hulton"
,
"Hum"
,
"Humbert"
,
"Humberto"
,
"Humble"
,
"Hume"
,
"Humfrey"
,
"Humfrid"
,
"Humfried"
,
"Hummel"
,
"Humo"
,
"Hump"
,
"Humpage"
,
"Humph"
,
"Humphrey"
,
"Hun"
,
"Hunfredo"
,
"Hung"
,
"Hungarian"
,
"Hunger"
,
"Hunley"
,
"Hunsinger"
,
"Hunt"
,
"Hunter"
,
"Huntingdon"
,
"Huntington"
,
"Huntlee"
,
"Huntley"
,
"Huoh"
,
"Huppert"
,
"Hurd"
,
"Hurff"
,
"Hurlbut"
,
"Hurlee"
,
"Hurleigh"
,
"Hurless"
,
"Hurley"
,
"Hurlow"
,
"Hurst"
,
"Hurty"
,
"Hurwit"
,
"Hurwitz"
,
"Husain"
,
"Husch"
,
"Husein"
,
"Husha"
,
"Huskamp"
,
"Huskey"
,
"Hussar"
,
"Hussein"
,
"Hussey"
,
"Huston"
,
"Hut"
,
"Hutchings"
,
"Hutchins"
,
"Hutchinson"
,
"Hutchison"
,
"Hutner"
,
"Hutson"
,
"Hutt"
,
"Huttan"
,
"Hutton"
,
"Hux"
,
"Huxham"
,
"Huxley"
,
"Hwang"
,
"Hwu"
,
"Hy"
,
"Hyacinth"
,
"Hyacintha"
,
"Hyacinthe"
,
"Hyacinthia"
,
"Hyacinthie"
,
"Hyams"
,
"Hyatt"
,
"Hyde"
,
"Hylan"
,
"Hyland"
,
"Hylton"
,
"Hyman"
,
"Hymen"
,
"Hymie"
,
"Hynda"
,
"Hynes"
,
"Hyo"
,
"Hyozo"
,
"Hyps"
,
"Hyrup"
,
"Iago"
,
"Iain"
,
"Iams"
,
"Ian"
,
"Iand"
,
"Ianteen"
,
"Ianthe"
,
"Iaria"
,
"Iaverne"
,
"Ib"
,
"Ibbetson"
,
"Ibbie"
,
"Ibbison"
,
"Ibby"
,
"Ibrahim"
,
"Ibson"
,
"Ichabod"
,
"Icken"
,
"Id"
,
"Ida"
,
"Idalia"
,
"Idalina"
,
"Idaline"
,
"Idalla"
,
"Idden"
,
"Iddo"
,
"Ide"
,
"Idel"
,
"Idelia"
,
"Idell"
,
"Idelle"
,
"Idelson"
,
"Iden"
,
"Idette"
,
"Idleman"
,
"Idola"
,
"Idolah"
,
"Idolla"
,
"Idona"
,
"Idonah"
,
"Idonna"
,
"Idou"
,
"Idoux"
,
"Idzik"
,
"Iene"
,
"Ier"
,
"Ierna"
,
"Ieso"
,
"Ietta"
,
"Iey"
,
"Ifill"
,
"Igal"
,
"Igenia"
,
"Iggie"
,
"Iggy"
,
"Iglesias"
,
"Ignace"
,
"Ignacia"
,
"Ignacio"
,
"Ignacius"
,
"Ignatia"
,
"Ignatius"
,
"Ignatz"
,
"Ignatzia"
,
"Ignaz"
,
"Ignazio"
,
"Igor"
,
"Ihab"
,
"Iiette"
,
"Iila"
,
"Iinde"
,
"Iinden"
,
"Iives"
,
"Ike"
,
"Ikeda"
,
"Ikey"
,
"Ikkela"
,
"Ilaire"
,
"Ilan"
,
"Ilana"
,
"Ilario"
,
"Ilarrold"
,
"Ilbert"
,
"Ileana"
,
"Ileane"
,
"Ilene"
,
"Iline"
,
"Ilise"
,
"Ilka"
,
"Ilke"
,
"Illa"
,
"Illene"
,
"Illona"
,
"Illyes"
,
"Ilona"
,
"Ilonka"
,
"Ilowell"
,
"Ilsa"
,
"Ilse"
,
"Ilwain"
,
"Ilysa"
,
"Ilyse"
,
"Ilyssa"
,
"Im"
,
"Ima"
,
"Imalda"
,
"Iman"
,
"Imelda"
,
"Imelida"
,
"Imena"
,
"Immanuel"
,
"Imogen"
,
"Imogene"
,
"Imojean"
,
"Imray"
,
"Imre"
,
"Imtiaz"
,
"Ina"
,
"Incrocci"
,
"Indihar"
,
"Indira"
,
"Inerney"
,
"Ines"
,
"Inesita"
,
"Ineslta"
,
"Inessa"
,
"Inez"
,
"Infeld"
,
"Infield"
,
"Ing"
,
"Inga"
,
"Ingaberg"
,
"Ingaborg"
,
"Ingalls"
,
"Ingamar"
,
"Ingar"
,
"Inge"
,
"Ingeberg"
,
"Ingeborg"
,
"Ingelbert"
,
"Ingemar"
,
"Inger"
,
"Ingham"
,
"Inglebert"
,
"Ingles"
,
"Inglis"
,
"Ingmar"
,
"Ingold"
,
"Ingra"
,
"Ingraham"
,
"Ingram"
,
"Ingrid"
,
"Ingrim"
,
"Ingunna"
,
"Ingvar"
,
"Inigo"
,
"Inkster"
,
"Inman"
,
"Inna"
,
"Innes"
,
"Inness"
,
"Innis"
,
"Inoue"
,
"Intisar"
,
"Intosh"
,
"Intyre"
,
"Inverson"
,
"Iny"
,
"Ioab"
,
"Iolande"
,
"Iolanthe"
,
"Iolenta"
,
"Ion"
,
"Iona"
,
"Iong"
,
"Iorgo"
,
"Iorgos"
,
"Iorio"
,
"Iormina"
,
"Iosep"
,
"Ioved"
,
"Iover"
,
"Ioves"
,
"Iow"
,
"Ioyal"
,
"Iphagenia"
,
"Iphigenia"
,
"Iphigeniah"
,
"Iphlgenia"
,
"Ira"
,
"Iran"
,
"Irby"
,
"Iredale"
,
"Ireland"
,
"Irena"
,
"Irene"
,
"Irfan"
,
"Iridis"
,
"Iridissa"
,
"Irina"
,
"Iris"
,
"Irisa"
,
"Irish"
,
"Irita"
,
"Irma"
,
"Irme"
,
"Irmgard"
,
"Irmina"
,
"Irmine"
,
"Irra"
,
"Irv"
,
"Irvin"
,
"Irvine"
,
"Irving"
,
"Irwin"
,
"Irwinn"
,
"Isa"
,
"Isaac"
,
"Isaacs"
,
"Isaacson"
,
"Isaak"
,
"Isabea"
,
"Isabeau"
,
"Isabel"
,
"Isabelita"
,
"Isabella"
,
"Isabelle"
,
"Isac"
,
"Isacco"
,
"Isador"
,
"Isadora"
,
"Isadore"
,
"Isahella"
,
"Isaiah"
,
"Isak"
,
"Isbel"
,
"Isbella"
,
"Isborne"
,
"Iseabal"
,
"Isherwood"
,
"Ishii"
,
"Ishmael"
,
"Ishmul"
,
"Isia"
,
"Isiah"
,
"Isiahi"
,
"Isidor"
,
"Isidora"
,
"Isidore"
,
"Isidoro"
,
"Isidro"
,
"Isis"
,
"Isla"
,
"Islaen"
,
"Island"
,
"Isle"
,
"Islean"
,
"Isleana"
,
"Isleen"
,
"Islek"
,
"Isma"
,
"Isman"
,
"Isobel"
,
"Isola"
,
"Isolda"
,
"Isolde"
,
"Isolt"
,
"Israel"
,
"Israeli"
,
"Issi"
,
"Issiah"
,
"Issie"
,
"Issy"
,
"Ita"
,
"Itagaki"
,
"Itch"
,
"Ithaman"
,
"Ithnan"
,
"Itin"
,
"Iva"
,
"Ivah"
,
"Ivan"
,
"Ivana"
,
"Ivanah"
,
"Ivanna"
,
"Ivar"
,
"Ivatts"
,
"Ive"
,
"Ivens"
,
"Iver"
,
"Ivers"
,
"Iverson"
,
"Ives"
,
"Iveson"
,
"Ivett"
,
"Ivette"
,
"Ivetts"
,
"Ivey"
,
"Ivie"
,
"Ivo"
,
"Ivon"
,
"Ivonne"
,
"Ivor"
,
"Ivory"
,
"Ivy"
,
"Iy"
,
"Iyre"
,
"Iz"
,
"Izaak"
,
"Izabel"
,
"Izak"
,
"Izawa"
,
"Izy"
,
"Izzy"
,
"Ja"
,
"Jaal"
,
"Jaala"
,
"Jaan"
,
"Jaban"
,
"Jabe"
,
"Jabez"
,
"Jabin"
,
"Jablon"
,
"Jabon"
,
"Jac"
,
"Jacenta"
,
"Jacey"
,
"Jacie"
,
"Jacinda"
,
"Jacinta"
,
"Jacintha"
,
"Jacinthe"
,
"Jacinto"
,
"Jack"
,
"Jackelyn"
,
"Jacki"
,
"Jackie"
,
"Jacklin"
,
"Jacklyn"
,
"Jackquelin"
,
"Jackqueline"
,
"Jackson"
,
"Jacky"
,
"Jaclin"
,
"Jaclyn"
,
"Jaco"
,
"Jacob"
,
"Jacoba"
,
"Jacobah"
,
"Jacobba"
,
"Jacobina"
,
"Jacobine"
,
"Jacobo"
,
"Jacobs"
,
"Jacobsen"
,
"Jacobsohn"
,
"Jacobson"
,
"Jacoby"
,
"Jacquelin"
,
"Jacqueline"
,
"Jacquelyn"
,
"Jacquelynn"
,
"Jacquenetta"
,
"Jacquenette"
,
"Jacques"
,
"Jacquet"
,
"Jacquetta"
,
"Jacquette"
,
"Jacqui"
,
"Jacquie"
,
"Jacy"
,
"Jacynth"
,
"Jada"
,
"Jadd"
,
"Jadda"
,
"Jaddan"
,
"Jaddo"
,
"Jade"
,
"Jadwiga"
,
"Jae"
,
"Jaeger"
,
"Jaehne"
,
"Jael"
,
"Jaela"
,
"Jaella"
,
"Jaenicke"
,
"Jaf"
,
"Jaffe"
,
"Jagir"
,
"Jago"
,
"Jahdai"
,
"Jahdal"
,
"Jahdiel"
,
"Jahdol"
,
"Jahn"
,
"Jahncke"
,
"Jaime"
,
"Jaime "
,
"Jaimie"
,
"Jain"
,
"Jaine"
,
"Jair"
,
"Jairia"
,
"Jake"
,
"Jakie"
,
"Jakob"
,
"Jakoba"
,
"Jala"
,
"Jalbert"
,
"Jallier"
,
"Jamaal"
,
"Jamal"
,
"Jamel"
,
"James"
,
"Jameson"
,
"Jamesy"
,
"Jamey"
,
"Jami"
,
"Jamie"
,
"Jamieson"
,
"Jamil"
,
"Jamila"
,
"Jamill"
,
"Jamilla"
,
"Jamille"
,
"Jamima"
,
"Jamin"
,
"Jamison"
,
"Jammal"
,
"Jammie"
,
"Jammin"
,
"Jamnes"
,
"Jamnis"
,
"Jan"
,
"Jana"
,
"Janaya"
,
"Janaye"
,
"Jandel"
,
"Jandy"
,
"Jane"
,
"Janean"
,
"Janeczka"
,
"Janeen"
,
"Janek"
,
"Janel"
,
"Janela"
,
"Janella"
,
"Janelle"
,
"Janene"
,
"Janenna"
,
"Janerich"
,
"Janessa"
,
"Janet"
,
"Janeta"
,
"Janetta"
,
"Janette"
,
"Janeva"
,
"Janey"
,
"Jangro"
,
"Jania"
,
"Janice"
,
"Janicki"
,
"Janie"
,
"Janifer"
,
"Janik"
,
"Janina"
,
"Janine"
,
"Janis"
,
"Janith"
,
"Janiuszck"
,
"Janka"
,
"Jankell"
,
"Jankey"
,
"Jann"
,
"Janna"
,
"Jannel"
,
"Jannelle"
,
"Jannery"
,
"Janos"
,
"Janot"
,
"Jansen"
,
"Jansson"
,
"Januarius"
,
"January"
,
"Januisz"
,
"Janus"
,
"Jany"
,
"Janyte"
,
"Japeth"
,
"Japha"
,
"Japheth"
,
"Jaqitsch"
,
"Jaquelin"
,
"Jaquelyn"
,
"Jaquenetta"
,
"Jaquenette"
,
"Jaquiss"
,
"Jaquith"
,
"Jara"
,
"Jarad"
,
"Jard"
,
"Jardena"
,
"Jareb"
,
"Jared"
,
"Jarek"
,
"Jaret"
,
"Jari"
,
"Jariah"
,
"Jarib"
,
"Jarid"
,
"Jarietta"
,
"Jarita"
,
"Jarl"
,
"Jarlath"
,
"Jarlathus"
,
"Jarlen"
,
"Jarnagin"
,
"Jarrad"
,
"Jarred"
,
"Jarrell"
,
"Jarret"
,
"Jarrett"
,
"Jarrid"
,
"Jarrod"
,
"Jarrow"
,
"Jarv"
,
"Jarvey"
,
"Jarvis"
,
"Jary"
,
"Jase"
,
"Jasen"
,
"Jasik"
,
"Jasisa"
,
"Jasmin"
,
"Jasmina"
,
"Jasmine"
,
"Jason"
,
"Jasper"
,
"Jasun"
,
"Jauch"
,
"Jaunita"
,
"Javed"
,
"Javier"
,
"Javler"
,
"Jaworski"
,
"Jay"
,
"Jaycee"
,
"Jaye"
,
"Jaylene"
,
"Jayme"
,
"Jaymee"
,
"Jaymie"
,
"Jayne"
,
"Jaynell"
,
"Jaynes"
,
"Jayson"
,
"Jazmin"
,
"Jdavie"
,
"Jea"
,
"Jean"
,
"Jean-Claude"
,
"Jeana"
,
"Jeane"
,
"Jeanelle"
,
"Jeanette"
,
"Jeanie"
,
"Jeanine"
,
"Jeanna"
,
"Jeanne"
,
"Jeannette"
,
"Jeannie"
,
"Jeannine"
,
"Jeavons"
,
"Jeaz"
,
"Jeb"
,
"Jecho"
,
"Jecoa"
,
"Jecon"
,
"Jeconiah"
,
"Jed"
,
"Jedd"
,
"Jeddy"
,
"Jedediah"
,
"Jedidiah"
,
"Jedlicka"
,
"Jedthus"
,
"Jeff"
,
"Jeffcott"
,
"Jefferey"
,
"Jeffers"
,
"Jefferson"
,
"Jeffery"
,
"Jeffie"
,
"Jeffrey"
,
"Jeffries"
,
"Jeffry"
,
"Jeffy"
,
"Jegar"
,
"Jeggar"
,
"Jegger"
,
"Jehanna"
,
"Jehiah"
,
"Jehial"
,
"Jehias"
,
"Jehiel"
,
"Jehius"
,
"Jehoash"
,
"Jehovah"
,
"Jehu"
,
"Jelena"
,
"Jelene"
,
"Jelks"
,
"Jelle"
,
"Jelsma"
,
"Jem"
,
"Jemena"
,
"Jemie"
,
"Jemima"
,
"Jemimah"
,
"Jemina"
,
"Jeminah"
,
"Jemine"
,
"Jemma"
,
"Jemmie"
,
"Jemmy"
,
"Jempty"
,
"Jemy"
,
"Jen"
,
"Jena"
,
"Jenda"
,
"Jenei"
,
"Jenelle"
,
"Jenesia"
,
"Jenette"
,
"Jeni"
,
"Jenica"
,
"Jeniece"
,
"Jenifer"
,
"Jeniffer"
,
"Jenilee"
,
"Jenine"
,
"Jenkel"
,
"Jenkins"
,
"Jenks"
,
"Jenn"
,
"Jenna"
,
"Jenne"
,
"Jennee"
,
"Jenness"
,
"Jennette"
,
"Jenni"
,
"Jennica"
,
"Jennie"
,
"Jennifer"
,
"Jennilee"
,
"Jennine"
,
"Jennings"
,
"Jenny"
,
"Jeno"
,
"Jens"
,
"Jensen"
,
"Jentoft"
,
"Jephthah"
,
"Jephum"
,
"Jepson"
,
"Jepum"
,
"Jer"
,
"Jerad"
,
"Jerald"
,
"Jeraldine"
,
"Jeralee"
,
"Jeramey"
,
"Jeramie"
,
"Jere"
,
"Jereld"
,
"Jereme"
,
"Jeremiah"
,
"Jeremias"
,
"Jeremie"
,
"Jeremy"
,
"Jeri"
,
"Jeritah"
,
"Jermain"
,
"Jermaine"
,
"Jerman"
,
"Jermayne"
,
"Jermyn"
,
"Jerol"
,
"Jerold"
,
"Jeroma"
,
"Jerome"
,
"Jeromy"
,
"Jerri"
,
"Jerrie"
,
"Jerrilee"
,
"Jerrilyn"
,
"Jerrine"
,
"Jerrol"
,
"Jerrold"
,
"Jerroll"
,
"Jerrome"
,
"Jerry"
,
"Jerrylee"
,
"Jerusalem"
,
"Jervis"
,
"Jerz"
,
"Jesh"
,
"Jesher"
,
"Jess"
,
"Jessa"
,
"Jessabell"
,
"Jessalin"
,
"Jessalyn"
,
"Jessamine"
,
"Jessamyn"
,
"Jesse"
,
"Jessee"
,
"Jesselyn"
,
"Jessen"
,
"Jessey"
,
"Jessi"
,
"Jessica"
,
"Jessie"
,
"Jessika"
,
"Jessy"
,
"Jestude"
,
"Jesus"
,
"Jeth"
,
"Jethro"
,
"Jeu"
,
"Jeunesse"
,
"Jeuz"
,
"Jevon"
,
"Jew"
,
"Jewel"
,
"Jewell"
,
"Jewelle"
,
"Jewett"
,
"Jews"
,
"Jez"
,
"Jezabel"
,
"Jezabella"
,
"Jezabelle"
,
"Jezebel"
,
"Jezreel"
,
"Ji"
,
"Jill"
,
"Jillana"
,
"Jillane"
,
"Jillayne"
,
"Jilleen"
,
"Jillene"
,
"Jilli"
,
"Jillian"
,
"Jillie"
,
"Jilly"
,
"Jim"
,
"Jimmie"
,
"Jimmy"
,
"Jinny"
,
"Jit"
,
"Jo"
,
"Jo Ann"
,
"Jo-Ann"
,
"Jo-Anne"
,
"JoAnn"
,
"JoAnne"
,
"Joab"
,
"Joachim"
,
"Joachima"
,
"Joacima"
,
"Joacimah"
,
"Joan"
,
"Joana"
,
"Joane"
,
"Joanie"
,
"Joann"
,
"Joanna"
,
"Joanne"
,
"Joannes"
,
"Joao"
,
"Joappa"
,
"Joaquin"
,
"Joash"
,
"Joashus"
,
"Job"
,
"Jobe"
,
"Jobey"
,
"Jobi"
,
"Jobie"
,
"Jobina"
,
"Joby"
,
"Jobye"
,
"Jobyna"
,
"Jocelin"
,
"Joceline"
,
"Jocelyn"
,
"Jocelyne"
,
"Jochbed"
,
"Jochebed"
,
"Jock"
,
"Jocko"
,
"Jodee"
,
"Jodi"
,
"Jodie"
,
"Jodoin"
,
"Jody"
,
"Joe"
,
"Joeann"
,
"Joed"
,
"Joel"
,
"Joela"
,
"Joelie"
,
"Joell"
,
"Joella"
,
"Joelle"
,
"Joellen"
,
"Joelly"
,
"Joellyn"
,
"Joelynn"
,
"Joerg"
,
"Joete"
,
"Joette"
,
"Joey"
,
"Joh"
,
"Johan"
,
"Johanan"
,
"Johann"
,
"Johanna"
,
"Johannah"
,
"Johannes"
,
"Johannessen"
,
"Johansen"
,
"Johathan"
,
"Johen"
,
"Johiah"
,
"Johm"
,
"John"
,
"Johna"
,
"Johnath"
,
"Johnathan"
,
"Johnathon"
,
"Johnette"
,
"Johnna"
,
"Johnnie"
,
"Johnny"
,
"Johns"
,
"Johnson"
,
"Johnsson"
,
"Johnsten"
,
"Johnston"
,
"Johnstone"
,
"Johny"
,
"Johppa"
,
"Johppah"
,
"Johst"
,
"Joice"
,
"Joiner"
,
"Jojo"
,
"Joktan"
,
"Jola"
,
"Jolanta"
,
"Jolda"
,
"Jolee"
,
"Joleen"
,
"Jolene"
,
"Jolenta"
,
"Joletta"
,
"Joli"
,
"Jolie"
,
"Joliet"
,
"Joline"
,
"Jollanta"
,
"Jollenta"
,
"Joly"
,
"Jolyn"
,
"Jolynn"
,
"Jon"
,
"Jona"
,
"Jonah"
,
"Jonas"
,
"Jonathan"
,
"Jonathon"
,
"Jonati"
,
"Jone"
,
"Jonell"
,
"Jones"
,
"Jonette"
,
"Joni"
,
"Jonie"
,
"Jonina"
,
"Jonis"
,
"Jonme"
,
"Jonna"
,
"Jonny"
,
"Joo"
,
"Joon"
,
"Joost"
,
"Jopa"
,
"Jordain"
,
"Jordan"
,
"Jordana"
,
"Jordanna"
,
"Jordans"
,
"Jordanson"
,
"Jordison"
,
"Jordon"
,
"Jorey"
,
"Jorgan"
,
"Jorge"
,
"Jorgensen"
,
"Jorgenson"
,
"Jori"
,
"Jorie"
,
"Jorin"
,
"Joris"
,
"Jorrie"
,
"Jorry"
,
"Jory"
,
"Jos"
,
"Joscelin"
,
"Jose"
,
"Josee"
,
"Josefa"
,
"Josefina"
,
"Joseito"
,
"Joselow"
,
"Joselyn"
,
"Joseph"
,
"Josepha"
,
"Josephina"
,
"Josephine"
,
"Josephson"
,
"Joses"
,
"Josey"
,
"Josh"
,
"Joshi"
,
"Joshia"
,
"Joshua"
,
"Joshuah"
,
"Josi"
,
"Josiah"
,
"Josias"
,
"Josie"
,
"Josler"
,
"Joslyn"
,
"Josselyn"
,
"Josy"
,
"Jotham"
,
"Joub"
,
"Joung"
,
"Jourdain"
,
"Jourdan"
,
"Jovi"
,
"Jovia"
,
"Jovita"
,
"Jovitah"
,
"Jovitta"
,
"Jowett"
,
"Joy"
,
"Joya"
,
"Joyan"
,
"Joyann"
,
"Joyce"
,
"Joycelin"
,
"Joye"
,
"Jozef"
,
"Jsandye"
,
"Juan"
,
"Juana"
,
"Juanita"
,
"Juanne"
,
"Juback"
,
"Jud"
,
"Judah"
,
"Judas"
,
"Judd"
,
"Jude"
,
"Judenberg"
,
"Judi"
,
"Judie"
,
"Judith"
,
"Juditha"
,
"Judon"
,
"Judsen"
,
"Judson"
,
"Judus"
,
"Judy"
,
"Judye"
,
"Jueta"
,
"Juetta"
,
"Juieta"
,
"Jule"
,
"Julee"
,
"Jules"
,
"Juley"
,
"Juli"
,
"Julia"
,
"Julian"
,
"Juliana"
,
"Juliane"
,
"Juliann"
,
"Julianna"
,
"Julianne"
,
"Juliano"
,
"Julide"
,
"Julie"
,
"Julienne"
,
"Juliet"
,
"Julieta"
,
"Julietta"
,
"Juliette"
,
"Julina"
,
"Juline"
,
"Julio"
,
"Julis"
,
"Julissa"
,
"Julita"
,
"Julius"
,
"Jumbala"
,
"Jump"
,
"Jun"
,
"Juna"
,
"June"
,
"Junette"
,
"Jung"
,
"Juni"
,
"Junia"
,
"Junie"
,
"Junieta"
,
"Junina"
,
"Junius"
,
"Junji"
,
"Junko"
,
"Junna"
,
"Junno"
,
"Juno"
,
"Jurdi"
,
"Jurgen"
,
"Jurkoic"
,
"Just"
,
"Justen"
,
"Juster"
,
"Justicz"
,
"Justin"
,
"Justina"
,
"Justine"
,
"Justinian"
,
"Justinn"
,
"Justino"
,
"Justis"
,
"Justus"
,
"Juta"
,
"Jutta"
,
"Juxon"
,
"Jyoti"
,
"Kablesh"
,
"Kacerek"
,
"Kacey"
,
"Kachine"
,
"Kacie"
,
"Kacy"
,
"Kaczer"
,
"Kaden"
,
"Kadner"
,
"Kado"
,
"Kaela"
,
"Kaenel"
,
"Kaete"
,
"Kafka"
,
"Kahaleel"
,
"Kahl"
,
"Kahle"
,
"Kahler"
,
"Kahlil"
,
"Kahn"
,
"Kai"
,
"Kaia"
,
"Kaila"
,
"Kaile"
,
"Kailey"
,
"Kain"
,
"Kaine"
,
"Kaiser"
,
"Kaitlin"
,
"Kaitlyn"
,
"Kaitlynn"
,
"Kaiulani"
,
"Kaja"
,
"Kajdan"
,
"Kakalina"
,
"Kal"
,
"Kala"
,
"Kalagher"
,
"Kalasky"
,
"Kalb"
,
"Kalbli"
,
"Kale"
,
"Kaleb"
,
"Kaleena"
,
"Kalfas"
,
"Kali"
,
"Kalie"
,
"Kalikow"
,
"Kalil"
,
"Kalila"
,
"Kalin"
,
"Kalina"
,
"Kalinda"
,
"Kalindi"
,
"Kaliope"
,
"Kaliski"
,
"Kalk"
,
"Kall"
,
"Kalle"
,
"Kalli"
,
"Kallick"
,
"Kallista"
,
"Kallman"
,
"Kally"
,
"Kalman"
,
"Kalmick"
,
"Kaltman"
,
"Kalvin"
,
"Kalvn"
,
"Kam"
,
"Kama"
,
"Kamal"
,
"Kamaria"
,
"Kamat"
,
"Kameko"
,
"Kamerman"
,
"Kamila"
,
"Kamilah"
,
"Kamillah"
,
"Kamin"
,
"Kammerer"
,
"Kamp"
,
"Kampmann"
,
"Kampmeier"
,
"Kan"
,
"Kanal"
,
"Kancler"
,
"Kandace"
,
"Kandy"
,
"Kane"
,
"Kania"
,
"Kannan"
,
"Kannry"
,
"Kano"
,
"Kant"
,
"Kanter"
,
"Kantor"
,
"Kantos"
,
"Kanya"
,
"Kape"
,
"Kaplan"
,
"Kapoor"
,
"Kapor"
,
"Kappel"
,
"Kappenne"
,
"Kara"
,
"Kara-Lynn"
,
"Karalee"
,
"Karalynn"
,
"Karame"
,
"Karas"
,
"Karb"
,
"Kare"
,
"Karee"
,
"Kareem"
,
"Karel"
,
"Karen"
,
"Karena"
,
"Kari"
,
"Karia"
,
"Karie"
,
"Karil"
,
"Karilla"
,
"Karilynn"
,
"Karim"
,
"Karin"
,
"Karina"
,
"Karine"
,
"Kariotta"
,
"Karisa"
,
"Karissa"
,
"Karita"
,
"Karl"
,
"Karla"
,
"Karlan"
,
"Karlee"
,
"Karleen"
,
"Karlen"
,
"Karlene"
,
"Karlens"
,
"Karli"
,
"Karlie"
,
"Karlik"
,
"Karlin"
,
"Karlis"
,
"Karlise"
,
"Karlotta"
,
"Karlotte"
,
"Karlow"
,
"Karly"
,
"Karlyn"
,
"Karmen"
,
"Karna"
,
"Karney"
,
"Karol"
,
"Karola"
,
"Karole"
,
"Karolina"
,
"Karoline"
,
"Karoly"
,
"Karolyn"
,
"Karon"
,
"Karp"
,
"Karr"
,
"Karrah"
,
"Karrie"
,
"Karry"
,
"Karsten"
,
"Kartis"
,
"Karwan"
,
"Kary"
,
"Karyl"
,
"Karylin"
,
"Karyn"
,
"Kasevich"
,
"Kasey"
,
"Kashden"
,
"Kask"
,
"Kaslik"
,
"Kaspar"
,
"Kasper"
,
"Kass"
,
"Kassab"
,
"Kassandra"
,
"Kassaraba"
,
"Kassel"
,
"Kassey"
,
"Kassi"
,
"Kassia"
,
"Kassie"
,
"Kassity"
,
"Kast"
,
"Kat"
,
"Kata"
,
"Katalin"
,
"Kataway"
,
"Kate"
,
"Katee"
,
"Katerina"
,
"Katerine"
,
"Katey"
,
"Kath"
,
"Katha"
,
"Katharina"
,
"Katharine"
,
"Katharyn"
,
"Kathe"
,
"Katherin"
,
"Katherina"
,
"Katherine"
,
"Katheryn"
,
"Kathi"
,
"Kathie"
,
"Kathleen"
,
"Kathlene"
,
"Kathlin"
,
"Kathrine"
,
"Kathryn"
,
"Kathryne"
,
"Kathy"
,
"Kathye"
,
"Kati"
,
"Katie"
,
"Katina"
,
"Katine"
,
"Katinka"
,
"Katlaps"
,
"Katleen"
,
"Katlin"
,
"Kato"
,
"Katonah"
,
"Katrina"
,
"Katrine"
,
"Katrinka"
,
"Katsuyama"
,
"Katt"
,
"Katti"
,
"Kattie"
,
"Katuscha"
,
"Katusha"
,
"Katushka"
,
"Katy"
,
"Katya"
,
"Katz"
,
"Katzen"
,
"Katzir"
,
"Katzman"
,
"Kauffman"
,
"Kauffmann"
,
"Kaufman"
,
"Kaufmann"
,
"Kaule"
,
"Kauppi"
,
"Kauslick"
,
"Kavanagh"
,
"Kavanaugh"
,
"Kavita"
,
"Kawai"
,
"Kawasaki"
,
"Kay"
,
"Kaya"
,
"Kaycee"
,
"Kaye"
,
"Kayla"
,
"Kayle"
,
"Kaylee"
,
"Kayley"
,
"Kaylil"
,
"Kaylyn"
,
"Kayne"
,
"Kaz"
,
"Kazim"
,
"Kazimir"
,
"Kazmirci"
,
"Kazue"
,
"Kealey"
,
"Kean"
,
"Keane"
,
"Keare"
,
"Kearney"
,
"Keary"
,
"Keating"
,
"Keavy"
,
"Kee"
,
"Keefe"
,
"Keefer"
,
"Keegan"
,
"Keel"
,
"Keelby"
,
"Keele"
,
"Keeler"
,
"Keeley"
,
"Keelia"
,
"Keelin"
,
"Keely"
,
"Keen"
,
"Keenan"
,
"Keene"
,
"Keener"
,
"Keese"
,
"Keeton"
,
"Keever"
,
"Keffer"
,
"Keg"
,
"Kegan"
,
"Keheley"
,
"Kehoe"
,
"Kehr"
,
"Kei"
,
"Keifer"
,
"Keiko"
,
"Keil"
,
"Keily"
,
"Keir"
,
"Keisling"
,
"Keith"
,
"Keithley"
,
"Kela"
,
"Kelbee"
,
"Kelby"
,
"Kelcey"
,
"Kelci"
,
"Kelcie"
,
"Kelcy"
,
"Kelda"
,
"Keldah"
,
"Keldon"
,
"Kele"
,
"Keli"
,
"Keligot"
,
"Kelila"
,
"Kella"
,
"Kellby"
,
"Kellda"
,
"Kelleher"
,
"Kellen"
,
"Kellene"
,
"Keller"
,
"Kelley"
,
"Kelli"
,
"Kellia"
,
"Kellie"
,
"Kellina"
,
"Kellsie"
,
"Kelly"
,
"Kellyann"
,
"Kellyn"
,
"Kelsey"
,
"Kelsi"
,
"Kelson"
,
"Kelsy"
,
"Kelton"
,
"Kelula"
,
"Kelvin"
,
"Kelwen"
,
"Kelwin"
,
"Kelwunn"
,
"Kemble"
,
"Kemeny"
,
"Kemme"
,
"Kemp"
,
"Kempe"
,
"Kemppe"
,
"Ken"
,
"Kenay"
,
"Kenaz"
,
"Kendal"
,
"Kendall"
,
"Kendell"
,
"Kendra"
,
"Kendrah"
,
"Kendre"
,
"Kendrick"
,
"Kendricks"
,
"Kendry"
,
"Kendy"
,
"Kendyl"
,
"Kenelm"
,
"Kenison"
,
"Kenji"
,
"Kenlay"
,
"Kenlee"
,
"Kenleigh"
,
"Kenley"
,
"Kenn"
,
"Kenna"
,
"Kennan"
,
"Kennard"
,
"Kennedy"
,
"Kennet"
,
"Kenneth"
,
"Kennett"
,
"Kenney"
,
"Kennie"
,
"Kennith"
,
"Kenny"
,
"Kenon"
,
"Kenric"
,
"Kenrick"
,
"Kensell"
,
"Kent"
,
"Kenta"
,
"Kenti"
,
"Kentiga"
,
"Kentigera"
,
"Kentigerma"
,
"Kentiggerma"
,
"Kenton"
,
"Kenward"
,
"Kenway"
,
"Kenwee"
,
"Kenweigh"
,
"Kenwood"
,
"Kenwrick"
,
"Kenyon"
,
"Kenzi"
,
"Kenzie"
,
"Keon"
,
"Kepner"
,
"Keppel"
,
"Ker"
,
"Kerby"
,
"Kerek"
,
"Kerekes"
,
"Kerge"
,
"Keri"
,
"Keriann"
,
"Kerianne"
,
"Kerin"
,
"Kerk"
,
"Kerman"
,
"Kermie"
,
"Kermit"
,
"Kermy"
,
"Kern"
,
"Kernan"
,
"Kerns"
,
"Kerr"
,
"Kerri"
,
"Kerrie"
,
"Kerril"
,
"Kerrill"
,
"Kerrin"
,
"Kerrison"
,
"Kerry"
,
"Kersten"
,
"Kerstin"
,
"Kerwin"
,
"Kerwinn"
,
"Kerwon"
,
"Kery"
,
"Kesia"
,
"Kesley"
,
"Keslie"
,
"Kessel"
,
"Kessia"
,
"Kessiah"
,
"Kessler"
,
"Kester"
,
"Ketchan"
,
"Ketchum"
,
"Ketti"
,
"Kettie"
,
"Ketty"
,
"Keung"
,
"Kev"
,
"Kevan"
,
"Keven"
,
"Keverian"
,
"Keverne"
,
"Kevin"
,
"Kevina"
,
"Kevon"
,
"Kevyn"
,
"Key"
,
"Keyek"
,
"Keyes"
,
"Keynes"
,
"Keyser"
,
"Keyte"
,
"Kezer"
,
"Khai"
,
"Khajeh"
,
"Khalid"
,
"Khalil"
,
"Khalin"
,
"Khalsa"
,
"Khan"
,
"Khanna"
,
"Khano"
,
"Khichabia"
,
"Kho"
,
"Khorma"
,
"Khosrow"
,
"Khoury"
,
"Khudari"
,
"Ki"
,
"Kiah"
,
"Kial"
,
"Kidd"
,
"Kidder"
,
"Kiefer"
,
"Kieffer"
,
"Kieger"
,
"Kiehl"
,
"Kiel"
,
"Kiele"
,
"Kielty"
,
"Kienan"
,
"Kier"
,
"Kieran"
,
"Kiernan"
,
"Kiersten"
,
"Kikelia"
,
"Kiker"
,
"Kiki"
,
"Kila"
,
"Kilah"
,
"Kilan"
,
"Kilar"
,
"Kilbride"
,
"Kilby"
,
"Kile"
,
"Kiley"
,
"Kilgore"
,
"Kilian"
,
"Kilk"
,
"Killam"
,
"Killarney"
,
"Killen"
,
"Killian"
,
"Killie"
,
"Killigrew"
,
"Killion"
,
"Killoran"
,
"Killy"
,
"Kilmarx"
,
"Kilroy"
,
"Kim"
,
"Kimball"
,
"Kimbell"
,
"Kimber"
,
"Kimberlee"
,
"Kimberley"
,
"Kimberli"
,
"Kimberly"
,
"Kimberlyn"
,
"Kimble"
,
"Kimbra"
,
"Kimitri"
,
"Kimmel"
,
"Kimmi"
,
"Kimmie"
,
"Kimmy"
,
"Kimon"
,
"Kimura"
,
"Kin"
,
"Kinata"
,
"Kincaid"
,
"Kinch"
,
"Kinchen"
,
"Kind"
,
"Kindig"
,
"Kinelski"
,
"King"
,
"Kingdon"
,
"Kinghorn"
,
"Kingsbury"
,
"Kingsley"
,
"Kingsly"
,
"Kingston"
,
"Kinna"
,
"Kinnard"
,
"Kinney"
,
"Kinnie"
,
"Kinnon"
,
"Kinny"
,
"Kinsler"
,
"Kinsley"
,
"Kinsman"
,
"Kinson"
,
"Kinzer"
,
"Kiona"
,
"Kip"
,
"Kipp"
,
"Kippar"
,
"Kipper"
,
"Kippie"
,
"Kippy"
,
"Kipton"
,
"Kira"
,
"Kiran"
,
"Kirbee"
,
"Kirbie"
,
"Kirby"
,
"Kirch"
,
"Kirchner"
,
"Kiri"
,
"Kirima"
,
"Kirimia"
,
"Kirit"
,
"Kirk"
,
"Kirkpatrick"
,
"Kirkwood"
,
"Kironde"
,
"Kirsch"
,
"Kirschner"
,
"Kirshbaum"
,
"Kirst"
,
"Kirsten"
,
"Kirsteni"
,
"Kirsti"
,
"Kirstin"
,
"Kirstyn"
,
"Kirt"
,
"Kirtley"
,
"Kirven"
,
"Kirwin"
,
"Kisor"
,
"Kissee"
,
"Kissel"
,
"Kissiah"
,
"Kissie"
,
"Kissner"
,
"Kistner"
,
"Kisung"
,
"Kit"
,
"Kitchen"
,
"Kitti"
,
"Kittie"
,
"Kitty"
,
"Kiyohara"
,
"Kiyoshi"
,
"Kizzee"
,
"Kizzie"
,
"Kjersti"
,
"Klapp"
,
"Klara"
,
"Klarika"
,
"Klarrisa"
,
"Klatt"
,
"Klaus"
,
"Klayman"
,
"Klecka"
,
"Kleeman"
,
"Klehm"
,
"Kleiman"
,
"Klein"
,
"Kleinstein"
,
"Klemens"
,
"Klement"
,
"Klemm"
,
"Klemperer"
,
"Klenk"
,
"Kleon"
,
"Klepac"
,
"Kleper"
,
"Kletter"
,
"Kliber"
,
"Kliman"
,
"Kliment"
,
"Klimesh"
,
"Klina"
,
"Kline"
,
"Kling"
,
"Klingel"
,
"Klinger"
,
"Klinges"
,
"Klockau"
,
"Kloman"
,
"Klos"
,
"Kloster"
,
"Klotz"
,
"Klug"
,
"Kluge"
,
"Klump"
,
"Klusek"
,
"Klute"
,
"Knapp"
,
"Kneeland"
,
"Knepper"
,
"Knick"
,
"Knight"
,
"Knighton"
,
"Knipe"
,
"Knitter"
,
"Knobloch"
,
"Knoll"
,
"Knorring"
,
"Knowland"
,
"Knowle"
,
"Knowles"
,
"Knowling"
,
"Knowlton"
,
"Knox"
,
"Knudson"
,
"Knut"
,
"Knute"
,
"Knuth"
,
"Knutson"
,
"Ko"
,
"Koa"
,
"Koah"
,
"Koal"
,
"Koball"
,
"Kobe"
,
"Kobi"
,
"Koblas"
,
"Koblick"
,
"Koby"
,
"Kobylak"
,
"Koch"
,
"Koehler"
,
"Koenig"
,
"Koeninger"
,
"Koenraad"
,
"Koeppel"
,
"Koerlin"
,
"Koerner"
,
"Koetke"
,
"Koffler"
,
"Koffman"
,
"Koh"
,
"Kohl"
,
"Kohler"
,
"Kohn"
,
"Kokaras"
,
"Kokoruda"
,
"Kolb"
,
"Kolivas"
,
"Kolk"
,
"Koller"
,
"Kolnick"
,
"Kolnos"
,
"Kolodgie"
,
"Kolosick"
,
"Koloski"
,
"Kolva"
,
"Komara"
,
"Komarek"
,
"Komsa"
,
"Kondon"
,
"Kone"
,
"Kong"
,
"Konikow"
,
"Kono"
,
"Konopka"
,
"Konrad"
,
"Konstance"
,
"Konstantin"
,
"Konstantine"
,
"Konstanze"
,
"Konyn"
,
"Koo"
,
"Kooima"
,
"Koosis"
,
"Kopans"
,
"Kopaz"
,
"Kopp"
,
"Koppel"
,
"Kopple"
,
"Kora"
,
"Koral"
,
"Koralie"
,
"Koralle"
,
"Koran"
,
"Kordula"
,
"Kore"
,
"Korella"
,
"Koren"
,
"Korenblat"
,
"Koressa"
,
"Korey"
,
"Korff"
,
"Korfonta"
,
"Kori"
,
"Korie"
,
"Korman"
,
"Korney"
,
"Kornher"
,
"Korns"
,
"Korrie"
,
"Korry"
,
"Kort"
,
"Korten"
,
"Korwin"
,
"Korwun"
,
"Kory"
,
"Kosak"
,
"Kosaka"
,
"Kosel"
,
"Koser"
,
"Kosey"
,
"Kosiur"
,
"Koslo"
,
"Koss"
,
"Kosse"
,
"Kostival"
,
"Kostman"
,
"Kotick"
,
"Kotta"
,
"Kotto"
,
"Kotz"
,
"Kovacev"
,
"Kovacs"
,
"Koval"
,
"Kovar"
,
"Kowal"
,
"Kowalski"
,
"Kowatch"
,
"Kowtko"
,
"Koy"
,
"Koziara"
,
"Koziarz"
,
"Koziel"
,
"Kozloski"
,
"Kraft"
,
"Kragh"
,
"Krahling"
,
"Krahmer"
,
"Krakow"
,
"Krall"
,
"Kramer"
,
"Kramlich"
,
"Krantz"
,
"Kraska"
,
"Krasner"
,
"Krasnoff"
,
"Kraul"
,
"Kraus"
,
"Krause"
,
"Krauss"
,
"Kravits"
,
"Krawczyk"
,
"Kreager"
,
"Krebs"
,
"Kreda"
,
"Kreegar"
,
"Krefetz"
,
"Kreg"
,
"Kreiker"
,
"Krein"
,
"Kreindler"
,
"Kreiner"
,
"Kreis"
,
"Kreit"
,
"Kreitman"
,
"Krell"
,
"Kremer"
,
"Krenek"
,
"Krenn"
,
"Kresic"
,
"Kress"
,
"Krever"
,
"Kries"
,
"Krigsman"
,
"Krilov"
,
"Kris"
,
"Krischer"
,
"Krisha"
,
"Krishna"
,
"Krishnah"
,
"Krispin"
,
"Kriss"
,
"Krissie"
,
"Krissy"
,
"Krista"
,
"Kristal"
,
"Kristan"
,
"Kriste"
,
"Kristel"
,
"Kristen"
,
"Kristi"
,
"Kristian"
,
"Kristianson"
,
"Kristie"
,
"Kristien"
,
"Kristin"
,
"Kristina"
,
"Kristine"
,
"Kristo"
,
"Kristof"
,
"Kristofer"
,
"Kristoffer"
,
"Kristofor"
,
"Kristoforo"
,
"Kristopher"
,
"Kristos"
,
"Kristy"
,
"Kristyn"
,
"Krock"
,
"Kroll"
,
"Kronfeld"
,
"Krongold"
,
"Kronick"
,
"Kroo"
,
"Krucik"
,
"Krueger"
,
"Krug"
,
"Kruger"
,
"Krum"
,
"Krusche"
,
"Kruse"
,
"Krute"
,
"Kruter"
,
"Krutz"
,
"Krys"
,
"Kryska"
,
"Krysta"
,
"Krystal"
,
"Krystalle"
,
"Krystin"
,
"Krystle"
,
"Krystyna"
,
"Ku"
,
"Kubetz"
,
"Kubiak"
,
"Kubis"
,
"Kucik"
,
"Kudva"
,
"Kuebbing"
,
"Kuehn"
,
"Kuehnel"
,
"Kuhlman"
,
"Kuhn"
,
"Kulda"
,
"Kulseth"
,
"Kulsrud"
,
"Kumagai"
,
"Kumar"
,
"Kumler"
,
"Kung"
,
"Kunin"
,
"Kunkle"
,
"Kunz"
,
"Kuo"
,
"Kurland"
,
"Kurman"
,
"Kurr"
,
"Kursh"
,
"Kurt"
,
"Kurth"
,
"Kurtis"
,
"Kurtz"
,
"Kurtzig"
,
"Kurtzman"
,
"Kurys"
,
"Kurzawa"
,
"Kus"
,
"Kushner"
,
"Kusin"
,
"Kuska"
,
"Kussell"
,
"Kuster"
,
"Kutchins"
,
"Kuth"
,
"Kutzenco"
,
"Kutzer"
,
"Kwabena"
,
"Kwan"
,
"Kwang"
,
"Kwapong"
,
"Kwarteng"
,
"Kwasi"
,
"Kwei"
,
"Kwok"
,
"Kwon"
,
"Ky"
,
"Kyd"
,
"Kyl"
,
"Kyla"
,
"Kylah"
,
"Kylander"
,
"Kyle"
,
"Kylen"
,
"Kylie"
,
"Kylila"
,
"Kylstra"
,
"Kylynn"
,
"Kym"
,
"Kynan"
,
"Kyne"
,
"Kynthia"
,
"Kyriako"
,
"Kyrstin"
,
"Kyte"
,
"La"
,
"La Verne"
,
"LaBaw"
,
"LaMee"
,
"LaMonica"
,
"LaMori"
,
"LaRue"
,
"LaSorella"
,
"Laaspere"
,
"Laban"
,
"Labana"
,
"Laband"
,
"Labanna"
,
"Labannah"
,
"Labors"
,
"Lacagnia"
,
"Lacee"
,
"Lacefield"
,
"Lacey"
,
"Lach"
,
"Lachance"
,
"Lachish"
,
"Lachlan"
,
"Lachman"
,
"Lachus"
,
"Lacie"
,
"Lacombe"
,
"Lacy"
,
"Lad"
,
"Ladd"
,
"Laddie"
,
"Laddy"
,
"Laden"
,
"Ladew"
,
"Ladonna"
,
"Lady"
,
"Lael"
,
"Laetitia"
,
"Laflam"
,
"Lafleur"
,
"Laforge"
,
"Lagas"
,
"Lagasse"
,
"Lahey"
,
"Lai"
,
"Laidlaw"
,
"Lail"
,
"Laina"
,
"Laine"
,
"Lainey"
,
"Laing"
,
"Laird"
,
"Lais"
,
"Laise"
,
"Lait"
,
"Laith"
,
"Laius"
,
"Lakin"
,
"Laks"
,
"Laktasic"
,
"Lal"
,
"Lala"
,
"Lalage"
,
"Lali"
,
"Lalise"
,
"Lalita"
,
"Lalitta"
,
"Lalittah"
,
"Lalla"
,
"Lallage"
,
"Lally"
,
"Lalo"
,
"Lam"
,
"Lamar"
,
"Lamarre"
,
"Lamb"
,
"Lambard"
,
"Lambart"
,
"Lambert"
,
"Lamberto"
,
"Lambertson"
,
"Lambrecht"
,
"Lamdin"
,
"Lammond"
,
"Lamond"
,
"Lamont"
,
"Lamoree"
,
"Lamoureux"
,
"Lamp"
,
"Lampert"
,
"Lamphere"
,
"Lamprey"
,
"Lamrert"
,
"Lamrouex"
,
"Lamson"
,
"Lan"
,
"Lana"
,
"Lanae"
,
"Lanam"
,
"Lananna"
,
"Lancaster"
,
"Lance"
,
"Lancelle"
,
"Lancelot"
,
"Lancey"
,
"Lanctot"
,
"Land"
,
"Landa"
,
"Landahl"
,
"Landan"
,
"Landau"
,
"Landbert"
,
"Landel"
,
"Lander"
,
"Landers"
,
"Landes"
,
"Landing"
,
"Landis"
,
"Landmeier"
,
"Landon"
,
"Landre"
,
"Landri"
,
"Landrum"
,
"Landry"
,
"Landsman"
,
"Landy"
,
"Lane"
,
"Lanette"
,
"Laney"
,
"Lanford"
,
"Lanfri"
,
"Lang"
,
"Langan"
,
"Langbehn"
,
"Langdon"
,
"Lange"
,
"Langelo"
,
"Langer"
,
"Langham"
,
"Langill"
,
"Langille"
,
"Langley"
,
"Langsdon"
,
"Langston"
,
"Lani"
,
"Lanie"
,
"Lanita"
,
"Lankton"
,
"Lanna"
,
"Lanni"
,
"Lannie"
,
"Lanny"
,
"Lansing"
,
"Lanta"
,
"Lantha"
,
"Lanti"
,
"Lantz"
,
"Lanza"
,
"Lapham"
,
"Lapides"
,
"Lapointe"
,
"Lapotin"
,
"Lara"
,
"Laraine"
,
"Larcher"
,
"Lardner"
,
"Lareena"
,
"Lareine"
,
"Larena"
,
"Larentia"
,
"Laresa"
,
"Largent"
,
"Lari"
,
"Larianna"
,
"Larimer"
,
"Larimor"
,
"Larimore"
,
"Larina"
,
"Larine"
,
"Laris"
,
"Larisa"
,
"Larissa"
,
"Lark"
,
"Larkin"
,
"Larkins"
,
"Larner"
,
"Larochelle"
,
"Laroy"
,
"Larrabee"
,
"Larrie"
,
"Larrisa"
,
"Larry"
,
"Lars"
,
"Larsen"
,
"Larson"
,
"Laryssa"
,
"Lasala"
,
"Lash"
,
"Lashar"
,
"Lashoh"
,
"Lashond"
,
"Lashonda"
,
"Lashonde"
,
"Lashondra"
,
"Lasko"
,
"Lasky"
,
"Lasley"
,
"Lasonde"
,
"Laspisa"
,
"Lasser"
,
"Lassiter"
,
"Laszlo"
,
"Lat"
,
"Latashia"
,
"Latea"
,
"Latham"
,
"Lathan"
,
"Lathe"
,
"Lathrop"
,
"Lathrope"
,
"Lati"
,
"Latia"
,
"Latif"
,
"Latimer"
,
"Latimore"
,
"Latin"
,
"Latini"
,
"Latisha"
,
"Latona"
,
"Latonia"
,
"Latoniah"
,
"Latouche"
,
"Latoya"
,
"Latoye"
,
"Latoyia"
,
"Latreece"
,
"Latreese"
,
"Latrell"
,
"Latrena"
,
"Latreshia"
,
"Latrice"
,
"Latricia"
,
"Latrina"
,
"Latt"
,
"Latta"
,
"Latterll"
,
"Lattie"
,
"Lattimer"
,
"Latton"
,
"Lattonia"
,
"Latty"
,
"Latvina"
,
"Lau"
,
"Lauber"
,
"Laubin"
,
"Laud"
,
"Lauder"
,
"Lauer"
,
"Laufer"
,
"Laughlin"
,
"Laughry"
,
"Laughton"
,
"Launce"
,
"Launcelot"
,
"Laundes"
,
"Laura"
,
"Lauraine"
,
"Laural"
,
"Lauralee"
,
"Laurance"
,
"Laure"
,
"Lauree"
,
"Laureen"
,
"Laurel"
,
"Laurella"
,
"Lauren"
,
"Laurena"
,
"Laurence"
,
"Laurene"
,
"Laurens"
,
"Laurent"
,
"Laurentia"
,
"Laurentium"
,
"Lauretta"
,
"Laurette"
,
"Lauri"
,
"Laurianne"
,
"Laurice"
,
"Laurie"
,
"Laurin"
,
"Laurinda"
,
"Laurita"
,
"Lauritz"
,
"Lauro"
,
"Lauryn"
,
"Lauter"
,
"Laux"
,
"Lauzon"
,
"Laval"
,
"Laveen"
,
"Lavella"
,
"Lavelle"
,
"Laven"
,
"Lavena"
,
"Lavern"
,
"Laverna"
,
"Laverne"
,
"Lavery"
,
"Lavina"
,
"Lavine"
,
"Lavinia"
,
"Lavinie"
,
"Lavoie"
,
"Lavona"
,
"Law"
,
"Lawford"
,
"Lawler"
,
"Lawley"
,
"Lawlor"
,
"Lawrence"
,
"Lawrenson"
,
"Lawry"
,
"Laws"
,
"Lawson"
,
"Lawton"
,
"Lawtun"
,
"Lay"
,
"Layla"
,
"Layman"
,
"Layne"
,
"Layney"
,
"Layton"
,
"Lazar"
,
"Lazare"
,
"Lazaro"
,
"Lazaruk"
,
"Lazarus"
,
"Lazes"
,
"Lazor"
,
"Lazos"
,
"Le"
,
"LeCroy"
,
"LeDoux"
,
"LeMay"
,
"LeRoy"
,
"LeVitus"
,
"Lea"
,
"Leach"
,
"Leacock"
,
"Leah"
,
"Leahey"
,
"Leake"
,
"Leal"
,
"Lean"
,
"Leanard"
,
"Leander"
,
"Leandra"
,
"Leandre"
,
"Leandro"
,
"Leann"
,
"Leanna"
,
"Leanne"
,
"Leanor"
,
"Leanora"
,
"Leaper"
,
"Lear"
,
"Leary"
,
"Leasia"
,
"Leatri"
,
"Leatrice"
,
"Leavelle"
,
"Leavitt"
,
"Leavy"
,
"Leban"
,
"Lebar"
,
"Lebaron"
,
"Lebbie"
,
"Leblanc"
,
"Lebna"
,
"Leboff"
,
"Lechner"
,
"Lecia"
,
"Leckie"
,
"Leclair"
,
"Lectra"
,
"Leda"
,
"Ledah"
,
"Ledda"
,
"Leddy"
,
"Ledeen"
,
"Lederer"
,
"Lee"
,
"LeeAnn"
,
"Leeann"
,
"Leeanne"
,
"Leede"
,
"Leeke"
,
"Leela"
,
"Leelah"
,
"Leeland"
,
"Leena"
,
"Leesa"
,
"Leese"
,
"Leesen"
,
"Leeth"
,
"Leff"
,
"Leffen"
,
"Leffert"
,
"Lefkowitz"
,
"Lefton"
,
"Leftwich"
,
"Lefty"
,
"Leggat"
,
"Legge"
,
"Leggett"
,
"Legra"
,
"Lehet"
,
"Lehman"
,
"Lehmann"
,
"Lehrer"
,
"Leia"
,
"Leibman"
,
"Leicester"
,
"Leid"
,
"Leif"
,
"Leifer"
,
"Leifeste"
,
"Leigh"
,
"Leigha"
,
"Leighland"
,
"Leighton"
,
"Leila"
,
"Leilah"
,
"Leilani"
,
"Leipzig"
,
"Leis"
,
"Leiser"
,
"Leisha"
,
"Leitao"
,
"Leith"
,
"Leitman"
,
"Lejeune"
,
"Lek"
,
"Lela"
,
"Lelah"
,
"Leland"
,
"Leler"
,
"Lelia"
,
"Lelith"
,
"Lello"
,
"Lem"
,
"Lema"
,
"Lemaceon"
,
"Lemal"
,
"Lemar"
,
"Lemcke"
,
"Lemieux"
,
"Lemire"
,
"Lemkul"
,
"Lemmie"
,
"Lemmuela"
,
"Lemmueu"
,
"Lemmy"
,
"Lemon"
,
"Lempres"
,
"Lemuel"
,
"Lemuela"
,
"Lemuelah"
,
"Len"
,
"Lena"
,
"Lenard"
,
"Lenci"
,
"Lenee"
,
"Lenes"
,
"Lenette"
,
"Lengel"
,
"Lenhard"
,
"Lenhart"
,
"Lenka"
,
"Lenna"
,
"Lennard"
,
"Lenni"
,
"Lennie"
,
"Lenno"
,
"Lennon"
,
"Lennox"
,
"Lenny"
,
"Leno"
,
"Lenora"
,
"Lenore"
,
"Lenox"
,
"Lenrow"
,
"Lenssen"
,
"Lentha"
,
"Lenwood"
,
"Lenz"
,
"Lenzi"
,
"Leo"
,
"Leod"
,
"Leodora"
,
"Leoine"
,
"Leola"
,
"Leoline"
,
"Leon"
,
"Leona"
,
"Leonanie"
,
"Leonard"
,
"Leonardi"
,
"Leonardo"
,
"Leone"
,
"Leonelle"
,
"Leonerd"
,
"Leong"
,
"Leonhard"
,
"Leoni"
,
"Leonid"
,
"Leonidas"
,
"Leonie"
,
"Leonor"
,
"Leonora"
,
"Leonore"
,
"Leonsis"
,
"Leonteen"
,
"Leontina"
,
"Leontine"
,
"Leontyne"
,
"Leopold"
,
"Leopoldeen"
,
"Leopoldine"
,
"Leor"
,
"Leora"
,
"Leotie"
,
"Lepine"
,
"Lepley"
,
"Lepp"
,
"Lepper"
,
"Lerner"
,
"Leroi"
,
"Leroy"
,
"Les"
,
"Lesak"
,
"Leschen"
,
"Lesh"
,
"Leshia"
,
"Lesko"
,
"Leslee"
,
"Lesley"
,
"Lesli"
,
"Leslie"
,
"Lesly"
,
"Lessard"
,
"Lesser"
,
"Lesslie"
,
"Lester"
,
"Lesya"
,
"Let"
,
"Leta"
,
"Letch"
,
"Letha"
,
"Lethia"
,
"Leticia"
,
"Letisha"
,
"Letitia"
,
"Letizia"
,
"Letreece"
,
"Letrice"
,
"Letsou"
,
"Letta"
,
"Lette"
,
"Letti"
,
"Lettie"
,
"Letty"
,
"Leund"
,
"Leupold"
,
"Lev"
,
"Levan"
,
"Levana"
,
"Levania"
,
"Levenson"
,
"Leventhal"
,
"Leventis"
,
"Leverett"
,
"Leverick"
,
"Leveridge"
,
"Leveroni"
,
"Levesque"
,
"Levey"
,
"Levi"
,
"Levin"
,
"Levina"
,
"Levine"
,
"Levins"
,
"Levinson"
,
"Levison"
,
"Levitan"
,
"Levitt"
,
"Levon"
,
"Levona"
,
"Levy"
,
"Lew"
,
"Lewak"
,
"Lewan"
,
"Lewanna"
,
"Lewellen"
,
"Lewendal"
,
"Lewert"
,
"Lewes"
,
"Lewie"
,
"Lewin"
,
"Lewis"
,
"Lewison"
,
"Lewiss"
,
"Lewls"
,
"Lewse"
,
"Lexi"
,
"Lexie"
,
"Lexine"
,
"Lexis"
,
"Lexy"
,
"Ley"
,
"Leyes"
,
"Leyla"
,
"Lezley"
,
"Lezlie"
,
"Lhary"
,
"Li"
,
"Lia"
,
"Liam"
,
"Lian"
,
"Liana"
,
"Liane"
,
"Lianna"
,
"Lianne"
,
"Lias"
,
"Liatrice"
,
"Liatris"
,
"Lib"
,
"Liba"
,
"Libb"
,
"Libbey"
,
"Libbi"
,
"Libbie"
,
"Libbna"
,
"Libby"
,
"Libenson"
,
"Liberati"
,
"Libna"
,
"Libnah"
,
"Liborio"
,
"Libove"
,
"Libre"
,
"Licastro"
,
"Licha"
,
"Licht"
,
"Lichtenfeld"
,
"Lichter"
,
"Licko"
,
"Lida"
,
"Lidah"
,
"Lidda"
,
"Liddie"
,
"Liddle"
,
"Liddy"
,
"Lidia"
,
"Lidstone"
,
"Lieberman"
,
"Liebermann"
,
"Liebman"
,
"Liebowitz"
,
"Liederman"
,
"Lief"
,
"Lienhard"
,
"Liesa"
,
"Lietman"
,
"Liew"
,
"Lifton"
,
"Ligetti"
,
"Liggett"
,
"Liggitt"
,
"Light"
,
"Lightfoot"
,
"Lightman"
,
"Lil"
,
"Lila"
,
"Lilac"
,
"Lilah"
,
"Lilas"
,
"Lili"
,
"Lilia"
,
"Lilian"
,
"Liliane"
,
"Lilias"
,
"Lilith"
,
"Lilithe"
,
"Lilla"
,
"Lilli"
,
"Lillian"
,
"Lillie"
,
"Lillis"
,
"Lillith"
,
"Lilllie"
,
"Lilly"
,
"Lillywhite"
,
"Lily"
,
"Lilyan"
,
"Lilybel"
,
"Lilybelle"
,
"Lim"
,
"Liman"
,
"Limann"
,
"Limber"
,
"Limbert"
,
"Limemann"
,
"Limoli"
,
"Lin"
,
"Lina"
,
"Linc"
,
"Lincoln"
,
"Lind"
,
"Linda"
,
"Lindahl"
,
"Lindberg"
,
"Lindblad"
,
"Lindbom"
,
"Lindeberg"
,
"Lindell"
,
"Lindemann"
,
"Linden"
,
"Linder"
,
"Linders"
,
"Lindgren"
,
"Lindholm"
,
"Lindi"
,
"Lindie"
,
"Lindley"
,
"Lindly"
,
"Lindner"
,
"Lindo"
,
"Lindon"
,
"Lindsay"
,
"Lindsey"
,
"Lindsley"
,
"Lindsy"
,
"Lindy"
,
"Line"
,
"Linea"
,
"Linehan"
,
"Linell"
,
"Linet"
,
"Linetta"
,
"Linette"
,
"Ling"
,
"Lingwood"
,
"Linis"
,
"Link"
,
"Linker"
,
"Linkoski"
,
"Linn"
,
"Linnea"
,
"Linnell"
,
"Linneman"
,
"Linnet"
,
"Linnette"
,
"Linnie"
,
"Linoel"
,
"Linsk"
,
"Linskey"
,
"Linson"
,
"Linus"
,
"Linzer"
,
"Linzy"
,
"Lion"
,
"Lionel"
,
"Lionello"
,
"Lipcombe"
,
"Lipfert"
,
"Lipinski"
,
"Lipkin"
,
"Lipman"
,
"Liponis"
,
"Lipp"
,
"Lippold"
,
"Lipps"
,
"Lipscomb"
,
"Lipsey"
,
"Lipski"
,
"Lipson"
,
"Lira"
,
"Liris"
,
"Lisa"
,
"Lisabet"
,
"Lisabeth"
,
"Lisan"
,
"Lisandra"
,
"Lisbeth"
,
"Liscomb"
,
"Lise"
,
"Lisetta"
,
"Lisette"
,
"Lisha"
,
"Lishe"
,
"Lisk"
,
"Lisle"
,
"Liss"
,
"Lissa"
,
"Lissak"
,
"Lissi"
,
"Lissie"
,
"Lissner"
,
"Lissy"
,
"Lister"
,
"Lita"
,
"Litch"
,
"Litha"
,
"Lithea"
,
"Litman"
,
"Litt"
,
"Litta"
,
"Littell"
,
"Little"
,
"Littlejohn"
,
"Littman"
,
"Litton"
,
"Liu"
,
"Liuka"
,
"Liv"
,
"Liva"
,
"Livesay"
,
"Livi"
,
"Livia"
,
"Livingston"
,
"Livingstone"
,
"Livvi"
,
"Livvie"
,
"Livvy"
,
"Livvyy"
,
"Livy"
,
"Liz"
,
"Liza"
,
"Lizabeth"
,
"Lizbeth"
,
"Lizette"
,
"Lizzie"
,
"Lizzy"
,
"Ljoka"
,
"Llewellyn"
,
"Llovera"
,
"Lloyd"
,
"Llywellyn"
,
"Loar"
,
"Loats"
,
"Lobel"
,
"Lobell"
,
"Lochner"
,
"Lock"
,
"Locke"
,
"Lockhart"
,
"Locklin"
,
"Lockwood"
,
"Lodge"
,
"Lodhia"
,
"Lodi"
,
"Lodie"
,
"Lodmilla"
,
"Lodovico"
,
"Lody"
,
"Loeb"
,
"Loella"
,
"Loesceke"
,
"Loferski"
,
"Loftis"
,
"Loftus"
,
"Logan"
,
"Loggia"
,
"Loggins"
,
"Loginov"
,
"Lohman"
,
"Lohner"
,
"Lohrman"
,
"Lohse"
,
"Lois"
,
"Loise"
,
"Lola"
,
"Lolande"
,
"Lolanthe"
,
"Lole"
,
"Loleta"
,
"Lolita"
,
"Lolly"
,
"Loma"
,
"Lomasi"
,
"Lomax"
,
"Lombard"
,
"Lombardi"
,
"Lombardo"
,
"Lombardy"
,
"Lon"
,
"Lona"
,
"London"
,
"Londoner"
,
"Lonee"
,
"Lonergan"
,
"Long"
,
"Longan"
,
"Longawa"
,
"Longerich"
,
"Longfellow"
,
"Longley"
,
"Longmire"
,
"Longo"
,
"Longtin"
,
"Longwood"
,
"Loni"
,
"Lonier"
,
"Lonna"
,
"Lonnard"
,
"Lonne"
,
"Lonni"
,
"Lonnie"
,
"Lonny"
,
"Lontson"
,
"Loomis"
,
"Loos"
,
"Lopes"
,
"Lopez"
,
"Lora"
,
"Lorain"
,
"Loraine"
,
"Loralee"
,
"Loralie"
,
"Loralyn"
,
"Loram"
,
"Lorant"
,
"Lord"
,
"Lordan"
,
"Loredana"
,
"Loredo"
,
"Loree"
,
"Loreen"
,
"Lorelei"
,
"Lorelie"
,
"Lorelle"
,
"Loren"
,
"Lorena"
,
"Lorene"
,
"Lorens"
,
"Lorenz"
,
"Lorenza"
,
"Lorenzana"
,
"Lorenzo"
,
"Loresz"
,
"Loretta"
,
"Lorette"
,
"Lori"
,
"Loria"
,
"Lorianna"
,
"Lorianne"
,
"Lorie"
,
"Lorien"
,
"Lorilee"
,
"Lorilyn"
,
"Lorimer"
,
"Lorin"
,
"Lorinda"
,
"Lorine"
,
"Loriner"
,
"Loring"
,
"Loris"
,
"Lorita"
,
"Lorn"
,
"Lorna"
,
"Lorne"
,
"Lorola"
,
"Lorolla"
,
"Lorollas"
,
"Lorou"
,
"Lorraine"
,
"Lorrayne"
,
"Lorri"
,
"Lorrie"
,
"Lorrimer"
,
"Lorrimor"
,
"Lorrin"
,
"Lorry"
,
"Lorsung"
,
"Lorusso"
,
"Lory"
,
"Lose"
,
"Loseff"
,
"Loss"
,
"Lossa"
,
"Losse"
,
"Lot"
,
"Lothair"
,
"Lothaire"
,
"Lothar"
,
"Lothario"
,
"Lotson"
,
"Lotta"
,
"Lotte"
,
"Lotti"
,
"Lottie"
,
"Lotty"
,
"Lotus"
,
"Lotz"
,
"Lou"
,
"Louanna"
,
"Louanne"
,
"Louella"
,
"Lough"
,
"Lougheed"
,
"Loughlin"
,
"Louie"
,
"Louis"
,
"Louisa"
,
"Louise"
,
"Louisette"
,
"Louls"
,
"Lounge"
,
"Lourdes"
,
"Lourie"
,
"Louth"
,
"Loutitia"
,
"Loux"
,
"Lovash"
,
"Lovato"
,
"Love"
,
"Lovel"
,
"Lovell"
,
"Loveridge"
,
"Lovering"
,
"Lovett"
,
"Lovich"
,
"Lovmilla"
,
"Low"
,
"Lowe"
,
"Lowell"
,
"Lowenstein"
,
"Lowenstern"
,
"Lower"
,
"Lowery"
,
"Lowis"
,
"Lowndes"
,
"Lowney"
,
"Lowrance"
,
"Lowrie"
,
"Lowry"
,
"Lowson"
,
"Loy"
,
"Loyce"
,
"Loydie"
,
"Lozano"
,
"Lozar"
,
"Lu"
,
"Luana"
,
"Luane"
,
"Luann"
,
"Luanne"
,
"Luanni"
,
"Luba"
,
"Lubba"
,
"Lubbi"
,
"Lubbock"
,
"Lubeck"
,
"Luben"
,
"Lubet"
,
"Lubin"
,
"Lubow"
,
"Luby"
,
"Luca"
,
"Lucais"
,
"Lucania"
,
"Lucas"
,
"Lucchesi"
,
"Luce"
,
"Lucey"
,
"Lucho"
,
"Luci"
,
"Lucia"
,
"Lucian"
,
"Luciana"
,
"Luciano"
,
"Lucias"
,
"Lucic"
,
"Lucie"
,
"Lucien"
,
"Lucienne"
,
"Lucier"
,
"Lucila"
,
"Lucilia"
,
"Lucilla"
,
"Lucille"
,
"Lucina"
,
"Lucinda"
,
"Lucine"
,
"Lucio"
,
"Lucita"
,
"Lucius"
,
"Luckett"
,
"Luckin"
,
"Lucky"
,
"Lucrece"
,
"Lucretia"
,
"Lucy"
,
"Lud"
,
"Ludeman"
,
"Ludewig"
,
"Ludie"
,
"Ludlew"
,
"Ludlow"
,
"Ludly"
,
"Ludmilla"
,
"Ludovick"
,
"Ludovico"
,
"Ludovika"
,
"Ludvig"
,
"Ludwig"
,
"Ludwigg"
,
"Ludwog"
,
"Luebke"
,
"Luedtke"
,
"Luehrmann"
,
"Luella"
,
"Luelle"
,
"Lugar"
,
"Lugo"
,
"Luhe"
,
"Luhey"
,
"Luht"
,
"Luigi"
,
"Luigino"
,
"Luing"
,
"Luis"
,
"Luisa"
,
"Luise"
,
"Luiza"
,
"Lukas"
,
"Lukash"
,
"Lukasz"
,
"Luke"
,
"Lukey"
,
"Lukin"
,
"Lula"
,
"Lulita"
,
"Lull"
,
"Lulu"
,
"Lumbard"
,
"Lumbye"
,
"Lumpkin"
,
"Luna"
,
"Lund"
,
"Lundberg"
,
"Lundeen"
,
"Lundell"
,
"Lundgren"
,
"Lundin"
,
"Lundquist"
,
"Lundt"
,
"Lune"
,
"Lunetta"
,
"Lunette"
,
"Lunn"
,
"Lunna"
,
"Lunneta"
,
"Lunnete"
,
"Lunseth"
,
"Lunsford"
,
"Lunt"
,
"Luo"
,
"Lupe"
,
"Lupee"
,
"Lupien"
,
"Lupita"
,
"Lura"
,
"Lurette"
,
"Lurie"
,
"Lurleen"
,
"Lurlene"
,
"Lurline"
,
"Lusa"
,
"Lussi"
,
"Lussier"
,
"Lust"
,
"Lustick"
,
"Lustig"
,
"Lusty"
,
"Lutero"
,
"Luthanen"
,
"Luther"
,
"Luttrell"
,
"Luwana"
,
"Lux"
,
"Luz"
,
"Luzader"
,
"Ly"
,
"Lyall"
,
"Lyckman"
,
"Lyda"
,
"Lydell"
,
"Lydia"
,
"Lydie"
,
"Lydon"
,
"Lyell"
,
"Lyford"
,
"Lyle"
,
"Lyman"
,
"Lymann"
,
"Lymn"
,
"Lyn"
,
"Lynch"
,
"Lynd"
,
"Lynda"
,
"Lynde"
,
"Lyndel"
,
"Lyndell"
,
"Lynden"
,
"Lyndes"
,
"Lyndon"
,
"Lyndsay"
,
"Lyndsey"
,
"Lyndsie"
,
"Lyndy"
,
"Lynea"
,
"Lynelle"
,
"Lynett"
,
"Lynette"
,
"Lynn"
,
"Lynna"
,
"Lynne"
,
"Lynnea"
,
"Lynnell"
,
"Lynnelle"
,
"Lynnet"
,
"Lynnett"
,
"Lynnette"
,
"Lynnworth"
,
"Lyns"
,
"Lynsey"
,
"Lynus"
,
"Lyon"
,
"Lyons"
,
"Lyontine"
,
"Lyris"
,
"Lysander"
,
"Lyssa"
,
"Lytle"
,
"Lytton"
,
"Lyudmila"
,
"Ma"
,
"Maag"
,
"Mab"
,
"Mabel"
,
"Mabelle"
,
"Mable"
,
"Mac"
,
"MacCarthy"
,
"MacDermot"
,
"MacDonald"
,
"MacDonell"
,
"MacDougall"
,
"MacEgan"
,
"MacFadyn"
,
"MacFarlane"
,
"MacGregor"
,
"MacGuiness"
,
"MacIlroy"
,
"MacIntosh"
,
"MacIntyre"
,
"MacKay"
,
"MacKenzie"
,
"MacLaine"
,
"MacLay"
,
"MacLean"
,
"MacLeod"
,
"MacMahon"
,
"MacMillan"
,
"MacMullin"
,
"MacNair"
,
"MacNamara"
,
"MacPherson"
,
"MacRae"
,
"MacSwan"
,
"Macario"
,
"Maccarone"
,
"Mace"
,
"Macegan"
,
"Macey"
,
"Machos"
,
"Machute"
,
"Machutte"
,
"Mack"
,
"Mackenie"
,
"Mackenzie"
,
"Mackey"
,
"Mackie"
,
"Mackintosh"
,
"Mackler"
,
"Macknair"
,
"Mackoff"
,
"Macnair"
,
"Macomber"
,
"Macri"
,
"Macur"
,
"Macy"
,
"Mada"
,
"Madai"
,
"Madaih"
,
"Madalena"
,
"Madalyn"
,
"Madancy"
,
"Madaras"
,
"Maddalena"
,
"Madden"
,
"Maddeu"
,
"Maddi"
,
"Maddie"
,
"Maddis"
,
"Maddock"
,
"Maddocks"
,
"Maddox"
,
"Maddy"
,
"Madea"
,
"Madel"
,
"Madelaine"
,
"Madeleine"
,
"Madelena"
,
"Madelene"
,
"Madelin"
,
"Madelina"
,
"Madeline"
,
"Madella"
,
"Madelle"
,
"Madelon"
,
"Madelyn"
,
"Madge"
,
"Madi"
,
"Madian"
,
"Madid"
,
"Madigan"
,
"Madison"
,
"Madlen"
,
"Madlin"
,
"Madoc"
,
"Madonia"
,
"Madonna"
,
"Madora"
,
"Madox"
,
"Madra"
,
"Madriene"
,
"Madson"
,
"Mady"
,
"Mae"
,
"Maegan"
,
"Maeve"
,
"Mafala"
,
"Mafalda"
,
"Maffa"
,
"Maffei"
,
"Mag"
,
"Magan"
,
"Magas"
,
"Magavern"
,
"Magbie"
,
"Magda"
,
"Magdaia"
,
"Magdala"
,
"Magdalen"
,
"Magdalena"
,
"Magdalene"
,
"Magdau"
,
"Magee"
,
"Magel"
,
"Magen"
,
"Magena"
,
"Mages"
,
"Maggee"
,
"Maggi"
,
"Maggie"
,
"Maggio"
,
"Maggs"
,
"Maggy"
,
"Maghutte"
,
"Magill"
,
"Magna"
,
"Magner"
,
"Magnien"
,
"Magnolia"
,
"Magnum"
,
"Magnus"
,
"Magnuson"
,
"Magnusson"
,
"Magocsi"
,
"Magree"
,
"Maguire"
,
"Magulac"
,
"Mahala"
,
"Mahalia"
,
"Mahan"
,
"Mahau"
,
"Maher"
,
"Mahla"
,
"Mahmoud"
,
"Mahmud"
,
"Mahon"
,
"Mahoney"
,
"Maia"
,
"Maiah"
,
"Maibach"
,
"Maible"
,
"Maice"
,
"Maida"
,
"Maidel"
,
"Maidie"
,
"Maidy"
,
"Maier"
,
"Maiga"
,
"Maighdiln"
,
"Maighdlin"
,
"Mailand"
,
"Main"
,
"Mainis"
,
"Maiocco"
,
"Mair"
,
"Maire"
,
"Maise"
,
"Maisel"
,
"Maisey"
,
"Maisie"
,
"Maison"
,
"Maite"
,
"Maitilde"
,
"Maitland"
,
"Maitund"
,
"Maje"
,
"Majka"
,
"Major"
,
"Mak"
,
"Makell"
,
"Maker"
,
"Mal"
,
"Mala"
,
"Malachi"
,
"Malachy"
,
"Malamud"
,
"Malamut"
,
"Malan"
,
"Malanie"
,
"Malarkey"
,
"Malaspina"
,
"Malca"
,
"Malcah"
,
"Malchus"
,
"Malchy"
,
"Malcolm"
,
"Malcom"
,
"Malda"
,
"Maleeny"
,
"Malek"
,
"Maleki"
,
"Malena"
,
"Malet"
,
"Maletta"
,
"Mali"
,
"Malia"
,
