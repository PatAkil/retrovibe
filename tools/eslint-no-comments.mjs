const noComments = {
  meta: {
    type: 'suggestion',
    schema: [],
    messages: {
      comment: 'Comments are not allowed. Express intent through names, types and the game\'s STYLE.md.',
    },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (comment.type !== 'Shebang') {
            context.report({ loc: comment.loc, messageId: 'comment' });
          }
        }
      },
    };
  },
};

export default {
  meta: { name: 'retrovibe-local' },
  rules: { 'no-comments': noComments },
};
