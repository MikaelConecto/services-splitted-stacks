module.exports = {
  "roots": [
    "<rootDir>/"
  ],
  "transform": {
    "^.+\\.tsx?$": "ts-jest"
  },
  "collectCoverageFrom": [
    "<rootDir>/src/**"
  ],
  "testRegex": "(/tests/.*\.test)\.tsx?$",
  "moduleFileExtensions": [
    "ts",
    "tsx",
    "js",
    "jsx",
    "json",
    "node"
  ],
}