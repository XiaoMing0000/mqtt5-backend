# redis 配置

订阅redis过期事件，需要在redis.conf中配置notify-keyspace-events Ex，
客户端的连接 keepAlive 超时通过 redis connect:clientIdentifier key 过期进行控制。
