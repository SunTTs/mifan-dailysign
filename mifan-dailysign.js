/*
 * 🍚 米饭APP每日签到脚本
 */

const axios = require('axios');

// ==================== 配置区域 ====================
const CONFIG = {
    // token配置
    MIFAN_TOKEN: process.env.MIFAN_TOKEN,

    // API配置
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


// ==================== 签到核心逻辑 ====================
class MiFanSigner {
    constructor(token) {
        this.token = token;
        this.signResult = null;
    }

    async doSign() {
        try {
            Logger.info('正在检查签到状态...');
            const statusData = await NetworkUtils.request({
                method: 'GET',
                url: CONFIG.SIGN_STATUS_URL,
                headers: {
                    'Authorization': this.token
                }
            });
            if (statusData.code === 401) {
                throw new Error('签到失败，请重新获取token！');
            }
            if (statusData.code === 200 && statusData.data) {
                if (statusData.data === 1){
                    Logger.success('今日已签到');
                    this.signResult = '今日已签到';
                    return true;
                }else{
                    Logger.info('今日未签到，即将开始签到');
                }
            } else {
                throw new Error('获取签到状态失败：' + statusData.data);
            }

            Logger.info('开始执行签到...');
            const signData = await NetworkUtils.request({
                method: 'POST',
                url: CONFIG.SIGN_URL,
                headers: {
                    'Authorization': this.token
                }
            });
            if (signData.code === 200) {
                Logger.success('今日签到成功!');
                this.signResult = '今日签到成功!';
                return true;
            } else {
                throw new Error('签到异常：' + signData);
            }
        } catch (error) {
            Logger.error(error.message);
            this.signResult = error.message;
            return false;
        }
    }
    
}

// ==================== 主程序 ====================
async function main() {
    Logger.info('🍚 米饭APP每日签到脚本');
    
    // 检查必需环境变量
    if (!CONFIG.MIFAN_TOKEN) {
        Logger.error('未配置 MIFAN_TOKEN 环境变量，请检查配置');
        return;
    }
    
    // 解析多账号token（使用分号分割）
    const tokens = CONFIG.MIFAN_TOKEN.split(';').filter(token => token.trim());
    Logger.info(`检测到 ${tokens.length} 个账号`);
    
    const results = [];
    
    // 逐个处理账号
    for (let i = 0; i < tokens.length; i++) {
        Logger.info('==================================================');
        Logger.info(`开始处理第 ${i + 1} 个账号:`);
        
        const signer = new MiFanSigner(tokens[i]);
        let signStatus = false;
        let resultMsg = '';
        
        // 执行签到
        if (await signer.doSign()) {
            signStatus = true;
        }
        
        // 结果信息
        const status = signStatus ? '✅ 成功' : '❌ 失败';
        resultMsg = `第 ${i + 1} 个账号签到结果: ${status}`;
        Logger.info(resultMsg);
        
        results.push({
            account: i + 1,
            status: signStatus,
            message: resultMsg
        });
        
        // 账号间延迟
        if (i < tokens.length - 1) {
            await NetworkUtils.sleep(2000);
        }
    }
    
    // 输出最终统计
    const successCount = results.filter(r => r.status).length;
    const failCount = results.length - successCount;
    
    // 输出最终统计
    Logger.info('==================================================');
    Logger.success(`签到脚本结束! 成功: ${successCount}, 失败: ${failCount}`);
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