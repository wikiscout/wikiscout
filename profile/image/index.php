<?php
require_once __DIR__ . '/../../helpers.php';

// Serve images from local storage (equivalent to R2 in TypeScript)
// URL pattern: /profile/image/{path...}
$requestUri = $_SERVER['REQUEST_URI'] ?? '';
$pathMatch = null;
if (preg_match('#/profile/image/(.+)#', $requestUri, $pathMatch)) {
    $imagePath = $pathMatch[1];
    // Remove query string if present
    $imagePath = strtok($imagePath, '?');
} else {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Invalid path']);
    exit;
}

$content = getStoredFile($imagePath);

if ($content === null) {
    http_response_code(404);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Image not found']);
    exit;
}

// Determine content type from extension
$ext = strtolower(pathinfo($imagePath, PATHINFO_EXTENSION));
$contentType = match ($ext) {
    'png' => 'image/png',
    'gif' => 'image/gif',
    'webp' => 'image/webp',
    default => 'image/jpeg',
};

header("Content-Type: $contentType");
header('Cache-Control: public, max-age=31536000');
echo $content;
?>
