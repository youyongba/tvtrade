/**
 * 代理连接测试脚本 - SOCKS5 版本
 */

const https = require('https');
const tls = require('tls');
const net = require('net');
const { URL } = require('url');
const { SocksClient } = require('socks');

const HTTP_PROXY = 'http://127.0.0.1:7890';
const SOCKS_PROXY = { host: '127.0.0.1', port: 7890, type: 5 };
const TEST_URL = 'https://fapi.binance.com/fapi/v1/ping';

console.log('=== 代理连接测试 ===');
console.log('');

// 方法1: 使用 socks 库
async function testWithSocks5() {
  console.log('[测试1] SOCKS5 代理方式...');
  
  const targetUrl = new URL(TEST_URL);
  const startTime = Date.now();
  
  try {
    console.log('1. 通过 SOCKS5 连接目标服务器...');
    
    const { socket } = await SocksClient.createConnection({
      proxy: SOCKS_PROXY,
      command: 'connect',
      destination: {
        host: targetUrl.hostname,
        port: 443
      },
      timeout: 15000
    });
    
    console.log(`2. SOCKS5 隧道建立成功 (${Date.now() - startTime}ms)`);
    console.log('3. 开始 TLS 握手...');
    
    const tlsSocket = tls.connect({
      socket: socket,
      servername: targetUrl.hostname,
      rejectUnauthorized: true
    });
    
    return new Promise((resolve, reject) => {
      tlsSocket.setTimeout(15000);
      tlsSocket.on('timeout', () => {
        console.log('   ✗ TLS 超时');
        tlsSocket.destroy();
        reject(new Error('TLS超时'));
      });
      
      tlsSocket.on('secureConnect', () => {
        console.log(`4. TLS 握手完成 (${Date.now() - startTime}ms)`);
        
        const request = `GET ${targetUrl.pathname} HTTP/1.1\r\nHost: ${targetUrl.hostname}\r\nConnection: close\r\n\r\n`;
        tlsSocket.write(request);
      });
      
      let data = '';
      tlsSocket.on('data', (chunk) => {
        data += chunk.toString();
      });
      
      tlsSocket.on('end', () => {
        const body = data.split('\r\n\r\n')[1] || '';
        console.log(`5. 请求完成 (${Date.now() - startTime}ms)`);
        console.log(`   响应: ${body}`);
        console.log('   ✓ SOCKS5 测试成功!');
        resolve(body);
      });
      
      tlsSocket.on('error', (err) => {
        reject(err);
      });
    });
  } catch (err) {
    console.log(`   ✗ SOCKS5 失败: ${err.message}`);
    throw err;
  }
}

// 方法2: 使用 https-proxy-agent
async function testWithHttpsProxyAgent() {
  console.log('[测试2] https-proxy-agent 方式...');
  
  const { HttpsProxyAgent } = require('https-proxy-agent');
  const agent = new HttpsProxyAgent(HTTP_PROXY);
  
  const targetUrl = new URL(TEST_URL);
  const startTime = Date.now();
  
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: targetUrl.hostname,
      port: 443,
      path: targetUrl.pathname,
      method: 'GET',
      agent: agent,
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`   响应 (${Date.now() - startTime}ms): ${data}`);
        console.log('   ✓ https-proxy-agent 测试成功!');
        resolve(data);
      });
    });
    
    req.on('error', (err) => {
      console.log(`   ✗ 失败: ${err.message}`);
      reject(err);
    });
    
    req.on('timeout', () => {
      console.log('   ✗ 超时');
      req.destroy();
      reject(new Error('超时'));
    });
    
    req.end();
  });
}

// 方法3: 使用 socks-proxy-agent
async function testWithSocksProxyAgent() {
  console.log('[测试3] socks-proxy-agent 方式...');
  
  const { SocksProxyAgent } = require('socks-proxy-agent');
  const agent = new SocksProxyAgent('socks5://127.0.0.1:7890');
  
  const targetUrl = new URL(TEST_URL);
  const startTime = Date.now();
  
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: targetUrl.hostname,
      port: 443,
      path: targetUrl.pathname,
      method: 'GET',
      agent: agent,
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`   响应 (${Date.now() - startTime}ms): ${data}`);
        console.log('   ✓ socks-proxy-agent 测试成功!');
        resolve(data);
      });
    });
    
    req.on('error', (err) => {
      console.log(`   ✗ 失败: ${err.message}`);
      reject(err);
    });
    
    req.on('timeout', () => {
      console.log('   ✗ 超时');
      req.destroy();
      reject(new Error('超时'));
    });
    
    req.end();
  });
}

// 运行所有测试
async function runTests() {
  // 测试 socks-proxy-agent
  try {
    await testWithSocksProxyAgent();
  } catch (e) {}
  
  console.log('');
  
  // 测试 https-proxy-agent
  try {
    await testWithHttpsProxyAgent();
  } catch (e) {}
  
  console.log('');
  
  // 测试 socks 直接连接
  try {
    await testWithSocks5();
  } catch (e) {}
  
  console.log('\n=== 测试完成 ===');
}

runTests();
