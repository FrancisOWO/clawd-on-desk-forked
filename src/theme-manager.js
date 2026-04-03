// src/theme-manager.js - 主题管理模块
// 管理多主题配置、SVG预处理和实例分配

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// 加载默认主题配置（从 src 目录中的 JSON 文件）
const DEFAULT_THEMES_PATH = path.join(__dirname, 'default-themes.json');

function loadDefaultThemes() {
  try {
    const content = fs.readFileSync(DEFAULT_THEMES_PATH, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    console.warn('ThemeManager: Failed to load default themes, using fallback:', err.message);
    // Fallback default themes (in case JSON file is missing)
    const defaultColors = {
      "body": "#DE886D",
      "eyes": "#000000"
    };
    return {
      themes: {
        default: {
          name: "Default Orange",
          colors: defaultColors
        }
      },
      autoAssign: true,
      colorMap: defaultColors,
      defaultTheme: "default",
      aliases: {
        orange: "default"
      }
    };
  }
}

const DEFAULT_THEMES = loadDefaultThemes();

// 原始SVG目录
const ORIGINAL_SVG_DIR = path.join(__dirname, '..', 'assets', 'svg');

class ThemeManager {
  constructor() {
    this.userDataPath = app.getPath('userData');
    this.themesFile = path.join(this.userDataPath, 'clawd-themes.json');
    this.currentThemeFile = path.join(this.userDataPath, 'current-theme.json');
    this.themeCacheDir = path.join(this.userDataPath, 'Theme Cache');
    
    this.instanceId = null;
    this.currentTheme = null;
    this.themeDir = null;
  }

  // 初始化主题系统
  initialize(cliTheme) {
    // 确保主题配置文件存在
    this.ensureThemesFile();
    
    // 加载当前主题配置（或创建默认）
    const currentConfig = this.loadOrCreateCurrentConfig();
    
    // 获取或生成实例ID
    this.instanceId = this.getInstanceId();
    
    // 确定使用哪个主题
    // 优先级: 命令行参数 > 当前配置文件 > 自动分配 > 默认主题
    const themes = this.loadThemes();
    const defaultThemeKey = themes.defaultTheme || 'default';
    
    // 处理主题别名（如 orange -> default）
    const themeAliases = themes.aliases || {};
    const resolvedCliTheme = cliTheme && themeAliases[cliTheme] ? themeAliases[cliTheme] : cliTheme;
    
    if (resolvedCliTheme && themes.themes[resolvedCliTheme]) {
      this.currentTheme = resolvedCliTheme;
    } else if (currentConfig.themeKey && themes.themes[currentConfig.themeKey]) {
      this.currentTheme = currentConfig.themeKey;
    } else if (themes.autoAssign) {
      this.currentTheme = this.autoAssignTheme();
    } else {
      this.currentTheme = defaultThemeKey;
    }
    
    // 更新当前配置
    this.saveCurrentConfig({
      configPath: this.themesFile,
      themeKey: this.currentTheme
    });
    
    // 预处理SVG
    this.themeDir = this.processSvgs(this.currentTheme, this.instanceId);
    
    return {
      instanceId: this.instanceId,
      themeKey: this.currentTheme,
      themeDir: this.themeDir,
      themeName: themes.themes[this.currentTheme].name
    };
  }

  // 确保主题配置文件存在（如果存在中文配置则重置为英文）
  ensureThemesFile() {
    let needReset = false;
    
    if (!fs.existsSync(this.themesFile)) {
      needReset = true;
    } else {
      // 检查是否包含中文（旧配置），如果是则重置
      try {
        const content = fs.readFileSync(this.themesFile, 'utf8');
        // 检查是否包含中文字符
        if (/[\u4e00-\u9fa5]/.test(content)) {
          console.log('ThemeManager: Detected old config with Chinese characters, resetting to English...');
          needReset = true;
        }
      } catch (err) {
        needReset = true;
      }
    }
    
    if (needReset) {
      fs.writeFileSync(this.themesFile, JSON.stringify(DEFAULT_THEMES, null, 2));
    }
  }

  // 加载主题配置
  loadThemes() {
    try {
      const content = fs.readFileSync(this.themesFile, 'utf8');
      return JSON.parse(content);
    } catch (err) {
      console.warn('Failed to load themes, using defaults:', err.message);
      return DEFAULT_THEMES;
    }
  }

  // 保存主题配置
  saveThemes(themes) {
    fs.writeFileSync(this.themesFile, JSON.stringify(themes, null, 2));
  }

  // 加载或创建当前主题配置文件
  loadOrCreateCurrentConfig() {
    const defaultConfig = {
      configPath: this.themesFile,
      themeKey: 'default'
    };
    
    if (!fs.existsSync(this.currentThemeFile)) {
      // 文件不存在，创建默认配置
      fs.writeFileSync(this.currentThemeFile, JSON.stringify(defaultConfig, null, 2));
      return defaultConfig;
    }
    
    try {
      const content = fs.readFileSync(this.currentThemeFile, 'utf8');
      const config = JSON.parse(content);
      // 确保必要字段存在
      if (!config.configPath) config.configPath = this.themesFile;
      if (!config.themeKey) config.themeKey = 'default';
      return config;
    } catch (err) {
      console.warn('ThemeManager: Failed to load current config, using default:', err.message);
      // 文件损坏，重置为默认
      fs.writeFileSync(this.currentThemeFile, JSON.stringify(defaultConfig, null, 2));
      return defaultConfig;
    }
  }

  // 保存当前主题配置
  saveCurrentConfig(config) {
    try {
      fs.writeFileSync(this.currentThemeFile, JSON.stringify(config, null, 2));
    } catch (err) {
      console.warn('ThemeManager: Failed to save current config:', err.message);
    }
  }

  // 获取实例ID（基于 PID 的简单哈希）
  getInstanceId() {
    // 使用 PID 生成一个稳定的实例 ID（1-100 之间）
    const pid = process.pid;
    return (pid % 100) + 1;
  }

  // 自动分配主题
  autoAssignTheme() {
    const themes = this.loadThemes();
    const themeKeys = Object.keys(themes.themes);
    const themeIndex = (this.instanceId - 1) % themeKeys.length;
    return themeKeys[themeIndex];
  }

  // 预处理SVG文件（所有实例共享主题缓存）
  processSvgs(themeKey, instanceId) {
    const themes = this.loadThemes();
    const theme = themes.themes[themeKey];
    // 按主题缓存，所有实例共享
    const themeDir = path.join(this.themeCacheDir, `theme-${themeKey}`);
    
    // 检查缓存是否存在
    const markerFile = path.join(themeDir, '.theme');
    if (fs.existsSync(markerFile)) {
      const marker = JSON.parse(fs.readFileSync(markerFile, 'utf8'));
      if (marker.theme === themeKey) {
        // 缓存命中，复用已有文件
        console.log(`ThemeManager: Using cached SVGs for theme "${theme.name}"`);
        return themeDir;
      }
    }
    
    // 缓存未命中，处理所有SVG文件
    fs.mkdirSync(themeDir, { recursive: true });
    
    const svgFiles = fs.readdirSync(ORIGINAL_SVG_DIR).filter(f => f.endsWith('.svg'));
    
    // 获取颜色映射（从主题配置或全局 colorMap）
    const colorMap = themes.colorMap || {};
    
    for (const file of svgFiles) {
      const originalPath = path.join(ORIGINAL_SVG_DIR, file);
      const themedPath = path.join(themeDir, file);
      
      let content = fs.readFileSync(originalPath, 'utf8');
      
      // 替换颜色：使用 colorMap 将原始颜色映射到语义化 key，再替换为主题颜色
      for (const [colorKey, replacementColor] of Object.entries(theme.colors)) {
        // 获取原始颜色值（从 colorMap 中查找）
        const originalColor = colorMap[colorKey];
        if (originalColor) {
          const regex = new RegExp(originalColor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
          content = content.replace(regex, replacementColor);
        }
      }
      
      fs.writeFileSync(themedPath, content);
    }
    
    // 写入标记文件
    fs.writeFileSync(markerFile, JSON.stringify({ theme: themeKey, time: Date.now() }));
    
    console.log(`ThemeManager: Processed ${svgFiles.length} SVGs for theme "${theme.name}"`);
    return themeDir;
  }

  // 切换主题
  switchTheme(newThemeKey) {
    const themes = this.loadThemes();
    if (!themes.themes[newThemeKey]) {
      throw new Error(`Unknown theme: ${newThemeKey}`);
    }
    
    this.currentTheme = newThemeKey;
    this.themeDir = this.processSvgs(newThemeKey, this.instanceId);
    
    // 更新当前配置文件
    this.saveCurrentConfig({
      configPath: this.themesFile,
      themeKey: this.currentTheme
    });
    
    return {
      instanceId: this.instanceId,
      themeKey: this.currentTheme,
      themeDir: this.themeDir,
      themeName: themes.themes[newThemeKey].name
    };
  }

  // 获取所有可用主题
  getAllThemes() {
    const themes = this.loadThemes();
    return Object.entries(themes.themes).map(([key, info]) => ({
      key,
      name: info.name
    }));
  }

  // 获取当前主题信息
  getCurrentTheme() {
    return {
      instanceId: this.instanceId,
      themeKey: this.currentTheme,
      themeDir: this.themeDir,
      themeName: this.loadThemes().themes[this.currentTheme].name
    };
  }

  // 清理主题缓存
  clearCache() {
    if (fs.existsSync(this.themeCacheDir)) {
      fs.rmSync(this.themeCacheDir, { recursive: true });
      console.log('ThemeManager: Cache cleared');
    }
  }

  // 获取处理后的SVG路径
  getThemedSvgPath(svgName) {
    return path.join(this.themeDir, svgName);
  }
}

module.exports = ThemeManager;
