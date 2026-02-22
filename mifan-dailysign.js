/*
 * 🍚 米饭APP每日签到脚本
 */

const axios = require('axios');
const crypto = require('crypto');
const notify = require('./sendNotify.js');

// ==================== 配置区域 ====================
const CONFIG = {
    // 环境变量配置
    MIFAN_USER: process.env.MIFAN_USER,
    MIFAN_PASSWORD: process.env.MIFAN_PASSWORD,
    MIFAN_SUCCESS_NOTIFY: process.env.MIFAN_SUCCESS_NOTIFY || 'false',
    MIFAN_FAIL_NOTIFY: process.env.MIFAN_FAIL_NOTIFY || 'false',
    MIFAN_GID: process.env.MIFAN_GID || 689,

    // API配置
    LOGIN_URL: 'https://mifan.61.com/api/v1/login',
    LOGOUT_URL: 'https://mifan.61.com/api/v1/logout',
    SIGN_URL: 'https://mifan.61.com/api/v1/event/dailysign/',
    SIGN_STATUS_URL: 'https://mifan.61.com/api/v1/event/dailysign/status/',
    
    // 请求配置
    TIMEOUT: 10000,
    RETRY_TIMES: 3,
    RETRY_DELAY: 5000
};

// ==================== 工具函数 ====================
class Logger {
    static log(message, type = 'info') {
        const timestamp = new Date().toLocaleString('zh-CN');
        const prefix = {
            'info': 'ℹ️',
            'success': '✅',
            'warning': '⚠️',
            'error': '❌'
        }[type] || '';
        
        console.log(`[${timestamp}] ${prefix} ${message}`);
    }
    
    static info(message) { this.log(message, 'info'); }
    static success(message) { this.log(message, 'success'); }
    static warning(message) { this.log(message, 'warning'); }
    static error(message) { this.log(message, 'error'); }
}

class NetworkUtils {
    static async request(options, retries = CONFIG.RETRY_TIMES) {
        try {
            const response = await axios({
                method: options.method || 'GET',
                url: options.url,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 Edg/145.0.0.0',
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                data: options.data,
                params: options.params,
                timeout: CONFIG.TIMEOUT
            });
            
            return response.data;
        } catch (error) {
            if (retries > 0) {
                Logger.warning(`请求失败，${CONFIG.RETRY_DELAY/1000}秒后重试 (${CONFIG.RETRY_TIMES - retries + 1}/${CONFIG.RETRY_TIMES})`);
                await this.sleep(CONFIG.RETRY_DELAY);
                return this.request(options, retries - 1);
            }
            throw error;
        }
    }
    
    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ==================== 青龙面板通知函数 ====================
async function ql_notify(title, content) {
    try {
        Logger.info('正在发送通知...');
        await notify.sendNotify(title, content);
        Logger.success('发送通知成功！');
        return;
    } catch (error) {
        Logger.error(`通知发送失败: ${error.message}`);
        return;
    }
}


// ==================== 签到核心逻辑 ====================
class MiFanSigner {
    constructor() {
        this.errorResult = null;
    }

    async login(user, password) {
        try{
            Logger.info('正在执行登录...');
            const hashedPassword = crypto.createHash('md5').update(password).digest('hex');
            const loginData = await NetworkUtils.request({
                method: 'POST',
                url: CONFIG.LOGIN_URL,
                data: {
                    gid: CONFIG.MIFAN_GID,
                    uid: user,
                    password: hashedPassword,
                    tad: "",
                    encrypt: "true"
                },
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            if (loginData.code === 200) {
                Logger.success('登录成功！');
                return loginData.token
            }else{
                throw new Error('登录失败：' + loginData.data);
            }
        }catch (error) {
            Logger.error(error.message);
            this.errorResult = error.message;
            return null;
        }
    }

    async logout(token) {
        try {
            Logger.info('正在执行登出...');
            const logoutData = await NetworkUtils.request({
                method: 'POST',
                url: CONFIG.LOGOUT_URL,
                headers: {
                    'Authorization': token
                }
            });
            if (logoutData.code === 200) {
                Logger.success('登出成功！');
                return true;
            }else{
                throw new Error('登出失败：' + logoutData.data);
            }
        }catch (error) {
            Logger.error(error.message);
            this.errorResult = error.message;
            return false;
        }
    }

    async doSign(token) {
        try {
            Logger.info('正在检查签到状态...');
            const statusData = await NetworkUtils.request({
                method: 'GET',
                url: CONFIG.SIGN_STATUS_URL,
                headers: {
                    'Authorization': token
                }
            });
            if (statusData.code === 200) {
                if (statusData.data && statusData.data === 1){
                    Logger.success('今日已签到！');
                    return true;
                }else{
                    Logger.warning('今日未签到，即将开始签到');
                }
            } else {
                throw new Error('获取签到状态失败：' + statusData.data);
            }

            Logger.info('开始执行签到...');
            const signData = await NetworkUtils.request({
                method: 'POST',
                url: CONFIG.SIGN_URL,
                headers: {
                    'Authorization': token
                }
            });
            if (signData.code === 200) {
                Logger.success('今日签到成功!');
                return true;
            } else {
                throw new Error('签到异常：' + signData);
            }
        } catch (error) {
            Logger.error(error.message);
            this.errorResult = error.message;
            return false;
        }
    }
    
    getResult() {
        return this.errorResult;
    }
}

// ==================== 主程序 ====================
async function main() {
    Logger.info('🍚 米饭APP每日签到脚本');
    
    // 检查必需环境变量
    if (!CONFIG.MIFAN_USER) {
        Logger.error('未配置 MIFAN_USER 环境变量，请检查配置');
        return;
    }
    if (!CONFIG.MIFAN_PASSWORD) {
        Logger.error('未配置 MIFAN_PASSWORD 环境变量，请检查配置');
        return;
    }

    // 解析多账号（使用分号分割）
    const users = CONFIG.MIFAN_USER.split(';').filter(users => users.trim());
    const passwords = CONFIG.MIFAN_PASSWORD.split(';').filter(passwords => passwords.trim());
    if (users.length !== passwords.length) {
        Logger.error('MIFAN_USER 和 MIFAN_PASSWORD 环境变量数量不一致，请检查配置');
        return;
    }
    Logger.info(`检测到 ${users.length} 个账号`);
    
    const results = [];
    const tokens = [];
    
    // 逐个处理账号
    for (let i = 0; i < users.length; i++) {
        Logger.info('==================================================');
        Logger.info(`开始处理账号 ${users[i]} :`);

        const signer = new MiFanSigner();
        let signStatus = false;
        let resultMsg = '';
        // 登录
        let loginStatus = await signer.login(users[i], passwords[i]);
        if (loginStatus) {
            tokens.push(loginStatus);
            // 签到
            signStatus = await signer.doSign(tokens[i]);
        }

        // 发送成功通知
        if (CONFIG.MIFAN_SUCCESS_NOTIFY === 'true' && loginStatus && signStatus){
            await ql_notify('米饭APP每日签到脚本通知', `账号 ${users[i]} 今日签到成功!`)
        }
        // 发送失败通知
        if (CONFIG.MIFAN_FAIL_NOTIFY === 'true' && (!loginStatus || !signStatus)){
            let msg = signer.getResult();
            await ql_notify('米饭APP每日签到脚本通知', `账号 ${users[i]} 今日签到失败：\n ${msg}`)
        }

        // 登出
        if (loginStatus && signStatus) {
            await signer.logout(tokens[i]);
        }

        // 结果信息
        const statusText = (loginStatus && signStatus) ? '✅ 成功' : '❌ 失败';
        resultMsg = `账号 ${users[i]} 签到结果: ${statusText}`;
        Logger.info(resultMsg);
        
        results.push({
            account: users[i],
            status: loginStatus && signStatus,
            message: resultMsg
        });
        
        // 账号间延迟
        if (i < users.length - 1) {
            await NetworkUtils.sleep(3000);
        }
    }
    
    // 最终统计
    const successCount = results.filter(r => r.status).length;
    const failCount = results.length - successCount;
    Logger.info('==================================================');
    Logger.info(`签到脚本结束! 成功: ${successCount}, 失败: ${failCount}`);
    Logger.info('==================================================');
}

// ==================== 错误处理 ====================
process.on('unhandledRejection', (reason, promise) => {
    Logger.error(`未处理的Promise拒绝: ${reason}`);
});

process.on('uncaughtException', (error) => {
    Logger.error(`未捕获的异常: ${error.message}`);
    process.exit(1);
});

// ==================== 启动程序 ====================
if (require.main === module) {
    main().catch(error => {
        Logger.error(`程序执行出错: ${error.message}`);
        process.exit(1);
    });
}

module.exports = main;