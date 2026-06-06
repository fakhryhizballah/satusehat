module.exports = {
    apps: [{
        name: "node-app",
        script: "./main.js",
        watch: true,
        time: true,
        env: {
            NODE_ENV: "development",
        }
    }]
}