// Puts the active language's strings into the page. The strings themselves
// come with the theme (themes/<name>/theme.js). Elements carrying data-i18n
// get their text replaced, data-i18n-title their tooltip and aria label,
// data-i18n-label an <optgroup> label and data-i18n-html their markup.

export function applyLanguage (strings, lang) {
    const dict = strings[lang] || strings[Object.keys(strings)[0]];
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (dict[key] !== undefined) el.textContent = dict[key];
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (dict[key] !== undefined) {
            el.title = dict[key];
            el.setAttribute('aria-label', dict[key]);
        }
    });
    document.querySelectorAll('[data-i18n-label]').forEach(el => {
        const key = el.getAttribute('data-i18n-label');
        if (dict[key] !== undefined) el.label = dict[key];
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
        const key = el.getAttribute('data-i18n-html');
        if (dict[key] !== undefined) el.innerHTML = dict[key];
    });
    if (dict.docTitle) document.title = dict.docTitle;
    const meta = document.querySelector('meta[name="description"]');
    if (meta && dict.metaDescription) meta.content = dict.metaDescription;
    return dict;
}
