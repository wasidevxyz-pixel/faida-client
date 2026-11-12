module.exports = {
    apps: [{
        name: 'bas-server',
        script: 'server.js',
        cwd: './Backend',
        instances: 1,
        exec_mode: 'fork',          // Keep in fork mode because of local backup cron jobs
        autorestart: true,
        watch: false,
        max_memory_restart: '2500M', // Restart if memory exceeds 2500MB
        node_args: '--max-old-space-size=2500', // Allow Node to use the full 2.5GB RAM
        kill_timeout: 5000,         // Wait 5 seconds for clean shutdown before force-killing
        restart_delay: 3000,        // Wait 3 seconds before restarting
        error_file: '../logs/pm2-error.log',
        out_file: '../logs/pm2-out.log',
        log_date_format: 'YYYY-MM-DD HH:mm:ss',
        env: {
            NODE_ENV: 'production',
            PORT: 5001
        }
    }]
};
