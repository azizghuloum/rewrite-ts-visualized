const foo = (x) => {
  using_syntax_rules([t, t, (x)]).rewrite(
    splice(() => {
      t;
      t;
    })
  );
};
