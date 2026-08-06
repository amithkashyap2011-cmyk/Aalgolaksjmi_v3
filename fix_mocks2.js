import fs from 'fs';

const files = [
  "server/__tests__/aqea/benchmarks.test.ts",
  "server/__tests__/aqea/cnnPredictor.test.ts",
  "server/__tests__/aqea/cnnVoting.test.ts",
  "server/__tests__/aqea/engine.integration.test.ts",
  "server/__tests__/aqea/exitEngine.test.ts",
  "server/__tests__/aqea/multiTimeframeEngine.test.ts",
  "server/__tests__/aqea/orderFlowVoting.test.ts",
  "server/__tests__/aqea/ppoAuthority.test.ts",
  "server/__tests__/aqea/regimeEngine.test.ts",
  "server/__tests__/aqea/smartMoneyVoting.test.ts",
  "server/__tests__/aqea/riskEngine.test.ts"
];

const mockBlock = `import { jest } from '@jest/globals';

const chainMock = {
  sort: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  lean: (jest.fn() as any).mockResolvedValue([])
};

jest.unstable_mockModule("mongoose", () => {
  class MockSchema {
    static Types: any = { ObjectId: "ObjectId" };
    index() {}
  }
  return {
    default: {
      connection: { readyState: 1 },
      Types: { ObjectId: class { id: any; constructor(id: any) { this.id = id; } toString() { return this.id; } static isValid() { return true; } } },
      model: jest.fn().mockReturnValue({ index: jest.fn() }),
      Schema: MockSchema
    },
    Schema: MockSchema,
    model: jest.fn().mockReturnValue({ index: jest.fn() })
  };
});

jest.unstable_mockModule("../../src/models/Trade.js", () => ({
  Trade: { find: jest.fn().mockReturnValue(chainMock) }
}));

jest.unstable_mockModule("../../src/models/AqeaTradeAnalytics.js", () => ({
  AqeaTradeAnalytics: { find: jest.fn().mockReturnValue(chainMock), create: (jest.fn() as any).mockResolvedValue({}) }
}));
`;

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, 'utf8');
  
  // Find the first `jest.unstable_mockModule("../../src/services/` or `const {`
  let match = content.match(/jest\.unstable_mockModule\("\.\.\/\.\.\/src\/services\//);
  let index = match ? match.index : -1;
  
  if (index === -1) {
    match = content.match(/const\s+[\w\{\}\s,]+=\s+await\s+import/);
    index = match ? match.index : -1;
  }
  
  if (index === -1) {
    match = content.match(/describe\(/);
    index = match ? match.index : -1;
  }

  if (index !== -1) {
    content = mockBlock + '\n' + content.slice(index);
    fs.writeFileSync(file, content);
  }
}
