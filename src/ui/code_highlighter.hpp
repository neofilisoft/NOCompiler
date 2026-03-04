#pragma once

#include <QSyntaxHighlighter>
#include <QTextCharFormat>
#include <QVector>
#include <QRegularExpression>
#include <QString>

class QTextDocument;

class CodeHighlighter : public QSyntaxHighlighter {
public:
    explicit CodeHighlighter(QTextDocument* parent = nullptr);

    void setLanguage(const QString& language);

protected:
    void highlightBlock(const QString& text) override;

private:
    struct HighlightRule {
        QRegularExpression pattern;
        QTextCharFormat format;
    };

    void rebuildRules();
    void addRule(const QString& pattern, const QTextCharFormat& format);

    QString language_;
    QVector<HighlightRule> rules_;
    QTextCharFormat keywordFormat_;
    QTextCharFormat typeFormat_;
    QTextCharFormat stringFormat_;
    QTextCharFormat commentFormat_;
    QTextCharFormat numberFormat_;
    QTextCharFormat tagFormat_;
};