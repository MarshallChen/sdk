import url from 'url'
import merge from 'lodash.merge'
import cloneDeep from 'lodash.clonedeep'
import isFunction from 'lodash.isfunction'
import lodashIsObject from 'lodash.isobject'
import debug from 'debug'
import Promise from 'bluebird'
import request from 'superagent'
import urlmaker from './url'

export function lowLevel(host, method, rules) {
  return (url, params={}) => {
    // Return a Promise/A+
    return initRequest({
      host,
      url,
      method,
      rules,
    }, params)
  }
}

export function highLevel(host, { url, method, callback }, rules) {
  return (params={}) => {
    // Return a Promise/A+
    return initRequest({
      host,
      rules,
      url: urlmaker(url, params),
      method: method ? method.toLowerCase() : 'get',
    }, params, callback)
  }
}

function initRequest(opts, params, middleware) {
  var rules = opts.rules
  var options = isObject(params) ? params : {}

  if (rules) {
    if (rules.all)
      options = merge(cloneDeep(rules.all), options)
    if (rules[opts.method])
      options = merge(cloneDeep(rules[opts.method]), options)

    if (options.headers) {
      Object.keys(options.headers).forEach(k => {
        if (typeof(options.headers[k]) === 'function')
          options.headers[k] = options.headers[k]()
      })
    }
  }

  options.method = opts.method
  options.url = isAbsUri(opts.url) ?
    opts.url : url.resolve(opts.host, opts.url);

  if (options.json == undefined)
    options.json = true

  debug('sdk:request')(options)

  return new Promise((Resolve, Reject) => {
    if (!window._xhr) window._xhr = {}

    let req = request[options.method](options.url)
    window._xhr[options.url] = req

    if (options.headers)
      req.set(options.headers)
    if (options.json)
      req.accept('json').type('json')
    if (options.qs)
      req.query(options.qs)
    if (options.body)
      req.send(options.body)

    req.cancel = function _superAgentCancel() {
      window._xhr[options.url].abort()
      delete window._xhr[options.url]
    };

    req.end((err, res) => {
      delete window._xhr[options.url]
      if (err)
        return Reject(res)

      debug('sdk:response:status')(res.status)
      debug('sdk:response:headers')(res.header)
      debug('sdk:response:body')(res.body)

      let code = res.status;
      let body = res.body || res.text;

      if (isFunction(middleware)) {
        return middleware(res, body, (customError, customBody) => {
          if (customError)
            return Reject(customError)

          return Resolve({
            code,
            response: res,
            body: customBody || body
          })
        })
      }

      return Resolve({
        code,
        response: res,
        body
      })
    })

    return req
  })
}

function isObject(obj) {
  return obj && lodashIsObject(obj) && !isFunction(obj)
}

function isAbsUri(uri) {
  return uri && (uri.indexOf('http') === 0 || uri.indexOf('https') === 0)
}
