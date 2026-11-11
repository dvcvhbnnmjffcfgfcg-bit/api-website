# PostgreSQL — 账号：apigateway / 密码：apigateway123 / 库：apigateway
CREATE USER apigateway WITH PASSWORD 'apigateway123';
CREATE DATABASE apigateway OWNER apigateway;
GRANT ALL PRIVILEGES ON DATABASE apigateway TO apigateway;