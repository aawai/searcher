UPDATE `preferences` SET `background_image` = NULL WHERE `background_image` IS NOT NULL AND `background_image` NOT LIKE '/api/wallpaper/%' AND `background_image` NOT LIKE 'https://%';
