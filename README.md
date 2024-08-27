# server

# CMD

windows 关闭被占用端口的进程

```bash
netstat -ano | findstr PORT
taskkill /PID PID /F
```
