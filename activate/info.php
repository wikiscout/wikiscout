<?php
require_once __DIR__ . '/../helpers.php';
bootstrap();

global $teamName, $emailAddress, $supportUrl;

jsonResponse([
    'teamName' => $teamName,
    'emailAddress' => $emailAddress,
    'supportUrl' => $supportUrl,
]);
?>
