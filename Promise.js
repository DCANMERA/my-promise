;(function (root) {
  // Asynchronous uses polyfill for setImmediate to improve performance
  var ast =
    (typeof setImmediate === 'function' && setImmediate) ||
    function (fn) {
      setTimeout(fn, 0)
    }

  // Determines whether it is an array instance
  var isArray =
    Array.isArray ||
    function (value) {
      return Object.prototype.toString.call(value) === '[object Array]'
    }

  /**
   * Take a potentially misbehaving resolver function and make sure
   * onFulfilled and onRejected are only called once.
   * Makes no guarantees about asynchrony.
   * @param {Function} fn Promise parameter call
   * @param {Function} onFulfilled Resolve successful callback
   * @param {Function} onRejected Reject failed callback
   */
  function doResolve(fn, onFulfilled, onRejected) {
    var done = false
    try {
      fn(
        function (value) {
          if (done) {
            return
          }

          done = true
          onFulfilled(value)
        },
        function (reason) {
          if (done) {
            return
          }

          done = true
          onRejected(reason)
        }
      )
    } catch (error) {
      if (done) {
        return
      }

      done = true
      onRejected(error)
    }
  }

  /**
   * Customize the bind method
   * @param {Function} fn The object of this needs to be changed
   * @param {Object} thisArgs This points to the
   * @returns Function
   */
  function bind(fn, thisArgs) {
    return function () {
      fn.apply(thisArgs, arguments)
    }
  }

  /**
   * Deal with Promise
   * @param {Function} deferred Promise callback
   */
  function handle(deferred) {
    var _this = this

    if (this.state === 'pending') {
      return this.deferreds.push(deferred)
    }

    ast(function () {
      var result = null
      var callback =
        _this.state === 'fulfilled' ? deferred.onFulfilled : deferred.onRejected

      if (callback === null) {
        return (
          _this.state === 'fulfilled' ? deferred.resolve : deferred.reject
        )(_this.value)
      }

      try {
        result = callback(_this.value)
      } catch (error) {
        return deferred.reject(error)
      }

      deferred.resolve(result)
    })
  }

  /**
   * Handle all promises
   */
  function finale() {
    for (var i = 0; i < this.deferreds.length; i++) {
      handle.call(this, this.deferreds[i])
    }
    this.deferreds = []
  }

  /**
   * The resolve parameter method for the Promise
   * @param {*} newValue The return value on success
   */
  function resolve(newValue) {
    // Promise Resolution Procedure: https://github.com/promises-aplus/promises-spec#the-promise-resolution-procedure
    try {
      if (newValue === this) {
        throw new TypeError('A promise cannot be resolved with itself.')
      }

      if (
        newValue &&
        (typeof newValue === 'object' || typeof newValue === 'function')
      ) {
        var then = newValue.then
        if (typeof then === 'function') {
          return doResolve(
            bind(then, newValue),
            bind(resolve, this),
            bind(reject, this)
          )
        }
      }

      this.state = 'fulfilled'
      this.value = newValue
      finale.call(this)
    } catch (error) {
      reject.call(this, error)
    }
  }

  /**
   * The reject parameter method for the Promise
   * @param {*} newValue The return value on failed
   */
  function reject(newValue) {
    this.state = 'rejected'
    this.value = newValue
    finale.call(this)
  }

  /**
   * @class Handler
   * @param {Function} onFulfilled handle resolve
   * @param {Function} onRejected handle reject
   * @param {Function} resolve resolve function
   * @param {Function} reject reject function
   */
  function Handler(onFulfilled, onRejected, resolve, reject) {
    this.onFulfilled = typeof onFulfilled === 'function' ? onFulfilled : null
    this.onRejected = typeof onRejected === 'function' ? onRejected : null
    this.resolve = resolve
    this.reject = reject
  }

  /**
   * @class Promise
   * @param {Function} fn (resolve, reject) => {}
   */
  function Promise(fn) {
    if (typeof this !== 'object') {
      throw new TypeError('Promises must be constructed via new')
    }

    if (typeof fn !== 'function') {
      throw new TypeError(fn.name + 'not a function')
    }

    this.state = 'pending'
    this.value = undefined
    this.deferreds = []

    doResolve(fn, bind(resolve, this), bind(reject, this))
  }

  Promise.resolve = function (value) {
    if (value && typeof value === 'object' && value.constructor === Promise) {
      return value
    }

    return new Promise(function (resolve) {
      resolve(value)
    })
  }

  Promise.reject = function (reason) {
    new Promise(function (resolve, reject) {
      reject(reason)
    })
  }

  Promise.all = function () {
    var args = Array.prototype.slice.call(
      arguments.length === 1 && isArray(arguments[0] ? arguments[0] : arguments)
    )

    return new Promise(function (resolve, reject) {
      if (args.length === 0) {
        return resolve([])
      }

      var remaining = args.length

      function recursive(i, val) {
        try {
          if (val && (typeof val === 'object' || typeof val === 'function')) {
            var then = val.then

            if (typeof then === 'function') {
              return then.call(
                val,
                function (val) {
                  recursive(i, val)
                },
                reject
              )
            }
          }

          args[i] = val
          if (--remaining === 0) {
            resolve(args)
          }
        } catch (error) {
          reject(error)
        }
      }

      for (var i = 0; i < args.length; i++) {
        recursive(i, args[i])
      }
    })
  }

  Promise.race = function (values) {
    return new Promise(function (resolve, reject) {
      for (var i = 0; i < values.length; i++) {
        values[i].then(resolve, reject)
      }
    })
  }

  /**
   * Set the immediate function to execute callbacks
   * @param fn {function} Function to execute
   * @private
   */
  Promise.setImmediateFn = function setImmediateFn(fn) {
    asap = fn
  }

  Promise.prototype.then = function (onFulfilled, onRejected) {
    var _this = this

    return new Promise(function (resolve, reject) {
      handle.call(_this, new Handler(onFulfilled, onRejected, resolve, reject))
    })
  }

  Promise.prototype.catch = function (onRejected) {
    return this.then(null, onRejected)
  }

  Promise.prototype.always = function (callback) {
    var constructor = this.constructor

    return this.then(
      function (value) {
        return value
      },
      function (reason) {
        return constructor.resolve(callback()).then(function () {
          throw reason
        })
      }
    )
  }

  // Export the encapsulated Promise
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Promise
  }
  // Compatible with Promise
  else if (!root.Promise) {
    root.Promise = Promise
  }

})(this)
