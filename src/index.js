/**
 * @file Proxy Server
 * @author zdying
 */

require('colors');
var path = require('path');
var EventEmitter = require('events');
var openBrowser = require('op-browser');
var homedir = require('os-homedir');
var Hosts = require('./hosts');
var Rewrite = require('./rewrite');
var getLocalIP = require('./helpers/getLocalIP');
var Logger = require('./helpers/logger');
var createPacFile = require('./helpers/createPacFile');

var initFlow = require('./flows/initialize');

// global.log = log;

/**
 * hiproxy代理服务器
 * @param {Number} httpPort http代理服务端口号
 * @param {Number} httpsPort https代理服务器端口号
 * @param {String} dir 指定的工作路径
 * @extends EventEmitter
 * @constructor
 */
function ProxyServer (httpPort, httpsPort, dir) {
  EventEmitter.call(this);

  this.hosts = new Hosts();
  this.rewrite = new Rewrite();

  this.logger = new Logger(/*process.stdout, process.stderr*/);

  this.httpPort = httpPort;
  this.httpServer = null;

  this.httpsPort = httpsPort;
  this.httpsServer = null;

  this.dir = dir;
}

ProxyServer.prototype = {
  constructor: ProxyServer,
  // extends from EventEmitter
  __proto__: EventEmitter.prototype,

  /**
   * 启动代理服务
   *
   * @param {Object} config 配置字段
   * @return {Promise}
   * @public
   */
  start: function (config) {
    var hiproxy = this;
    return getLocalIP().then(function (ip) {
      hiproxy.localIP = ip;
      return new Promise(function (resolve, reject) {
        initFlow.use(function (ctx, next) {
          resolve([hiproxy.httpServer, hiproxy.httpsServer]);
          next();
        });
        initFlow.run({
          localIP: ip,
          args: config || {}
        }, null, hiproxy);
      });
    });
  },

  /**
   * 停止代理服务
   * @return {ProxyServer}
   * @public
   */
  stop: function () {
    this.httpServer.close();

    if (this.httpsServer) {
      this.httpsServer.close();
    }

    /**
     * Emitted when the hiproxy server(s) stop.
     * @event ProxyServer#stop
     */
    this.emit('stop');

    return this;
  },

  /**
   * 重启代理服务
   * @return {ProxyServer}
   * @public
   */
  restart: function () {
    return this.stop().start();
  },

  /**
   * 添加Hosts文件
   *
   * @param {String|Array} filePath `hosts`文件路径（绝对路径）
   * @return {ProxyServer}
   * @public
   */
  addHostsFile: function (filePath) {
    /**
     * Emitted when add hosts file.
     * @event ProxyServer#addHostsFile
     * @property {Array|String} filePath rewrite file path(s)
     */
    this.emit('addHostsFile', filePath);

    this.logger.debug('add hosts file: ' + filePath);

    this.hosts.addFile(filePath);
    this.createPacFile();
    return this;
  },

  /**
   * 添加rewrite文件
   *
   * @param {String|Array} filePath `rewrite`文件路径（绝对路径）
   * @return {ProxyServer}
   * @public
   */
  addRewriteFile: function (filePath) {
    /**
     * Emitted when add rewrite file.
     * @event ProxyServer#addRewriteFile
     * @property {Array|String} filePath rewrite file path(s)
     */
    this.emit('addRewriteFile', filePath);

    this.logger.debug('add rewrite file: ' + filePath);

    this.rewrite.addFile(filePath);
    this.createPacFile();
    return this;
  },

  /**
   * 打开浏览器窗口
   *
   * @param {String} browserName 浏览器名称
   * @param {String} url         要打开的url
   * @param {Boolean} [usePacProxy=false] 是否使用自动代理
   * @return {ProxyServer}
   * @public
   */
  openBrowser: function (browserName, url, usePacProxy) {
    var self = this;

    if (usePacProxy) {
      this.createPacFile().then(function (success) {
        self._open(browserName, url, true);
      });
    } else {
      this._open(browserName, url, false);
    }

    return this;
  },

  _open: function (browserName, url, usePacProxy) {
    var proxyURL = 'http://127.0.0.1:' + this.httpPort;
    var dataDir = path.join(homedir(), '.hiproxy', 'data-dir');

    if (usePacProxy) {
      openBrowser.open(browserName, url, '', proxyURL + '/proxy.pac', dataDir);
    } else {
      openBrowser.open(browserName, url, proxyURL, '', dataDir);
    }
    return this;
  },

  /**
   * 创建自动配置代理文件
   * @private
   */
  createPacFile: function () {
    var hosts = this.hosts.getHost();
    var rewrite = this.rewrite.getRule();
    var logger = this.logger;

    var allDomains = Object.keys(hosts).concat(Object.keys(rewrite));
    var domains = {};

    allDomains.forEach(function (domain) {
      domains[domain] = 1;
    });

    /**
     * Emitter when the `pac` proxy file is created or updated.
     * @event ProxyServer#creatPacFile
     * @property {Object} domains domain list
     */
    this.emit('creatPacFile', domains);

    return createPacFile(this.httpPort, this.localIP, domains)
      .then(function () {
        return true;
      })
      .catch(function (err) {
        logger.debug(err);
        return false;
      });
  },

  enableConfFile: function (type, filePath) {
    this[type] && this[type].enableFile(filePath);
  },

  disableConfFile: function (type, filePath) {
    this[type] && this[type].disableFile(filePath);
  },

  getDisabledConfFile: function (type, filePaths) {
    // TODO
    // get Host/Rewrite file status
    return null;
  }
};

module.exports = ProxyServer;
