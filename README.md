- Run xampp, and start apache & mysql
- add this to create database and its relations:

CREATE DATABASE chat_app;
USE chat_app;

CREATE TABLE users (
id INT PRIMARY KEY AUTO_INCREMENT,
username VARCHAR(50) UNIQUE NOT NULL,
password VARCHAR(255) NOT NULL,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE messages (
id INT PRIMARY KEY AUTO_INCREMENT,
user_id INT,
message TEXT NOT NULL,
file_path VARCHAR(255),
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
FOREIGN KEY (user_id) REFERENCES users(id)
);


- cd <path-to-folder-dir>
- node server.js
- open localhost:3000 on browser
- open localhost::3000 on incognito browser for separate user
- register both with different names
- login
- donezo