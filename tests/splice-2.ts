const foo = (x) => {
  using_rewrite_rules([t,t,x]).rewrite(splice(() => {
    t;
    t;
  }));  
}
