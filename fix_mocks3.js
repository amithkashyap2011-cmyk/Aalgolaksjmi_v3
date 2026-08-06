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
  "server/__tests__/aqea/riskEngine.test.ts",
  "server/__tests__/production/productionFramework.test.ts"
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

jest.unstable_mockModule("../../src/models/AqeaPerformance.js", () => ({
  AqeaPerformance: { find: jest.fn().mockReturnValue(chainMock) }
}));
`;

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, 'utf8');
  
  // Find the first `jest.unstable_mockModule` or `const {` or `const ... = await import`
  let index = -1;
  const match1 = content.match(/jest\.unstable_mockModule\("\.\.\/\.\.\/src\/services\//);
  if (match1) index = match1.index;
  
  if (index === -1) {
    const match2 = content.match(/const\s+[\w\{\}\s,]+=\s+(?:await\s+)?import/);
    if (match2) index = match2.index;
  }
  
  if (index === -1) {
    const match3 = content.match(/describe\(/);
    if (match3) index = match3.index;
  }

  if (index !== -1) {
    // Strip out all the bad mock blocks up to index
    content = mockBlock + '\n' + content.slice(index);
    fs.writeFileSync(file, content);
  }
}
