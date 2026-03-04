#include "ui/code_highlighter.hpp"

#include <QColor>
#include <QFont>
#include <QStringList>
#include <QTextDocument>

namespace {

QStringList keywordsForLanguage(const QString& language) {
    const QString lang = language.toLower();
    if (lang == "python") return {"and","as","class","def","elif","else","except","False","for","from","if","import","in","None","not","or","pass","return","True","try","while","with","yield"};
    if (lang == "c" || lang == "cpp") return {"auto","bool","break","case","catch","class","const","continue","default","delete","do","else","enum","false","for","if","namespace","new","nullptr","private","protected","public","return","sizeof","static","struct","switch","template","this","throw","true","try","typedef","typename","using","virtual","void","while"};
    if (lang == "csharp") return {"abstract","bool","class","else","false","for","foreach","if","in","int","namespace","new","null","private","protected","public","return","static","string","this","true","using","var","void","while"};
    if (lang == "java") return {"boolean","class","else","false","final","for","if","import","new","null","package","private","protected","public","return","static","this","true","void","while"};
    if (lang == "javascript" || lang == "php") return {"async","await","class","const","else","export","false","for","function","if","import","let","new","null","return","this","true","undefined","var","while"};
    if (lang == "rust") return {"as","break","const","else","enum","false","fn","for","if","impl","let","loop","match","mod","mut","pub","return","self","struct","trait","true","use","while"};
    if (lang == "lua") return {"and","do","else","elseif","end","false","for","function","if","in","local","nil","not","or","repeat","return","then","true","until","while"};
    if (lang == "zig") return {"const","defer","else","enum","fn","for","if","inline","pub","return","struct","switch","true","try","var","while"};
    if (lang == "scala") return {"case","class","def","else","extends","false","for","if","import","match","new","null","object","override","private","protected","return","trait","true","val","var","while"};
    if (lang == "ruby") return {"begin","class","def","do","else","elsif","end","false","if","module","nil","return","self","true","unless","when","while"};
    if (lang == "go") return {"break","case","const","default","defer","else","false","for","func","go","if","import","interface","nil","package","range","return","struct","switch","true","type","var"};
    return {};
}

QStringList typesForLanguage(const QString& language) {
    const QString lang = language.toLower();
    if (lang == "c" || lang == "cpp") return {"int","long","short","float","double","char","std","string"};
    if (lang == "csharp") return {"bool","byte","char","decimal","double","float","int","long","object","string"};
    if (lang == "java") return {"boolean","byte","char","double","float","int","long","String","System"};
    if (lang == "rust") return {"i8","i16","i32","i64","u8","u16","u32","u64","usize","String"};
    if (lang == "go") return {"bool","byte","error","float64","int","rune","string"};
    return {};
}

}  // namespace

CodeHighlighter::CodeHighlighter(QTextDocument* parent)
    : QSyntaxHighlighter(parent) {
    keywordFormat_.setForeground(QColor("#93c5fd"));
    keywordFormat_.setFontWeight(QFont::DemiBold);

    typeFormat_.setForeground(QColor("#86efac"));
    typeFormat_.setFontWeight(QFont::DemiBold);

    stringFormat_.setForeground(QColor("#fca5a5"));
    commentFormat_.setForeground(QColor("#64748b"));
    numberFormat_.setForeground(QColor("#fcd34d"));
    tagFormat_.setForeground(QColor("#67e8f9"));
    tagFormat_.setFontWeight(QFont::DemiBold);

    setLanguage("cpp");
}

void CodeHighlighter::setLanguage(const QString& language) {
    const QString normalized = language.toLower();
    if (language_ == normalized) {
        return;
    }
    language_ = normalized;
    rebuildRules();
    rehighlight();
}

void CodeHighlighter::highlightBlock(const QString& text) {
    for (const auto& rule : rules_) {
        auto matchIterator = rule.pattern.globalMatch(text);
        while (matchIterator.hasNext()) {
            const auto match = matchIterator.next();
            setFormat(match.capturedStart(), match.capturedLength(), rule.format);
        }
    }
}

void CodeHighlighter::rebuildRules() {
    rules_.clear();

    if (language_ == "html") {
        addRule(QStringLiteral("</?[A-Za-z][^>]*>"), tagFormat_);
        addRule(QStringLiteral("\"[^\"]*\""), stringFormat_);
        addRule(QStringLiteral("'[^']*'"), stringFormat_);
        addRule(QStringLiteral("<!--[^>]*-->"), commentFormat_);
        return;
    }

    for (const auto& keyword : keywordsForLanguage(language_)) {
        addRule(QStringLiteral("\\b") + QRegularExpression::escape(keyword) + QStringLiteral("\\b"), keywordFormat_);
    }

    for (const auto& typeName : typesForLanguage(language_)) {
        addRule(QStringLiteral("\\b") + QRegularExpression::escape(typeName) + QStringLiteral("\\b"), typeFormat_);
    }

    addRule(QStringLiteral("\"([^\"\\]|\\.)*\""), stringFormat_);
    addRule(QStringLiteral("'([^'\\]|\\.)*'"), stringFormat_);
    addRule(QStringLiteral("\\b[0-9]+(\\.[0-9]+)?\\b"), numberFormat_);

    if (language_ == "python" || language_ == "ruby") {
        addRule(QStringLiteral("#[^\\n]*"), commentFormat_);
    } else if (language_ == "lua") {
        addRule(QStringLiteral("--[^\\n]*"), commentFormat_);
    } else if (language_ == "php") {
        addRule(QStringLiteral("//[^\\n]*"), commentFormat_);
        addRule(QStringLiteral("#[^\\n]*"), commentFormat_);
    } else {
        addRule(QStringLiteral("//[^\\n]*"), commentFormat_);
    }
}

void CodeHighlighter::addRule(const QString& pattern, const QTextCharFormat& format) {
    rules_.push_back(HighlightRule{QRegularExpression(pattern), format});
}