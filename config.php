<?php
$servers = [
    'us-east.cirrusapi.com',
];
// Learn about API servers here: https://cirrusapi.com/hc/articles/3/15/14/servers
$apikey = 'your-api-key-here';
// Learn about API keys here: https://cirrusapi.com/docs/hc/articles/3/14/12/api-keys

$adminUserIds = [1, 2, 3];
// Webhook for error tracking (if you want it to notify you, I use a Discord webhook myself, but you can use any webhook)
$webhook = 'https://your-webhook-url-here';

$version = '2.0.0';

$username = 'FIRST-username';
$password = 'FIRST-password';

$siteName = 'WikiScout';
$emailAddress = 'support@example.org';
$teamName = 'WikiScout Team';
$supportUrl = 'https://wikiscout.example.org';

// Public URL where the UI is served (for links in QR codes, profile URLs, etc.)
$publicUrl = 'https://app.wikiscout.org';

// Data mode: 'first_api' for live FIRST API data, 'demo' for demo/test data
$dataMode = 'first_api';

// OpenRouter API key (for AI image processing in profiles)
$openrouterApiKey = '';

// Local storage path for uploaded images (alternative to R2)
$storagePath = __DIR__ . '/storage';

// Refresh intervals (ms) — sent in /dashboard/me/ config
$mobileRefreshInterval = 15000;
$desktopRefreshInterval = 5000;

$mysql = [
    'host' => 'localhost',
    'database' => 'wikiscout_db',
    'username' => 'your_mysql_user',
    'password' => 'your_mysql_password',
    'port' => 3306
];
?>
