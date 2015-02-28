var assert = require("assert");
var T = require('./tbone');

describe('@core TBone', function(){
  describe('is existential', function(){
    it('should equal itself', function(){
      assert.equal(T, T);
    });
  });
});
