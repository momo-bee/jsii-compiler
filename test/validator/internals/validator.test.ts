import * as spec from '@jsii/spec';
import { JsiiDiagnostic } from '../../../src/jsii-diagnostic';
import { ProjectInfo } from '../../../src/project-info';
import { Validator } from '../../../src/validator';

// These tests run the validator directly on hand-written assemblies. This
// reaches checks that the assembler never gets to exercise, because it either
// rejects the source code first, or always produces a well-formed model.

describe('type references', () => {
  test('JSII9000: a type from an assembly that is not in the dependency closure', () => {
    const diagnostics = validate(
      assemblyWith({
        'testpkg.Klass': klass('Klass', { methods: [{ name: 'method', returns: { type: { fqn: 'other.Foreign' } } }] }),
      }),
    );

    expect(diagnostics).toEqual([
      expect.objectContaining({
        jsiiCode: 9000,
        messageText: 'Encountered use of module that is not declared in "dependencies" or "peerDependencies": "other"',
      }),
    ]);
  });

  test('JSII9001: a type that the dependency does not declare', () => {
    const diagnostics = validate(
      assemblyWith({
        'testpkg.Klass': klass('Klass', { methods: [{ name: 'method', returns: { type: { fqn: 'other.Missing' } } }] }),
      }),
      [dependency('other', { 'other.Foreign': klass('Foreign', { assembly: 'other', fqn: 'other.Foreign' }) })],
    );

    expect(diagnostics).toEqual([
      expect.objectContaining({
        jsiiCode: 9001,
        messageText: 'Type not found in the corresponding assembly: "other.Missing"',
      }),
    ]);
  });
});

describe('member names', () => {
  test('members without a name are skipped by the Java getter and setter checks', () => {
    // The spec requires a name, the validator still guards against its absence.
    const diagnostics = validate(
      assemblyWith({
        'testpkg.Klass': klass('Klass', { methods: [{} as spec.Method, { name: 'getFoo' }] }),
      }),
    );

    expect(diagnostics).toEqual([expect.objectContaining({ jsiiCode: 5000 })]);
  });

  test('a member that is not bound to a source node gets a diagnostic without a location', () => {
    const diagnostics = validate(
      assemblyWith({
        'testpkg.Klass': klass('Klass', { methods: [{ name: 'getFoo' }] }),
      }),
    );

    expect(diagnostics).toEqual([
      expect.objectContaining({
        jsiiCode: 5000,
        messageText: expect.stringContaining('Rename "Klass.getFoo"'),
        file: undefined,
        start: undefined,
      }),
    ]);
  });
});

describe('inheritance', () => {
  // @TODO(ts7): JSII5021 (_abstractClassesMustImplementAllProperties) is not ported yet
  test.skip('JSII5021: an abstract class that does not declare an optional interface property', () => {
    const diagnostics = validate(
      assemblyWith({
        'testpkg.IOther': {
          assembly: 'testpkg',
          fqn: 'testpkg.IOther',
          kind: spec.TypeKind.Interface,
          name: 'IOther',
          properties: [
            { abstract: true, name: 'prop', optional: true, type: { primitive: spec.PrimitiveType.String } },
          ],
        },
        'testpkg.Klass': klass('Klass', { abstract: true, interfaces: ['testpkg.IOther'] }),
      }),
    );

    expect(diagnostics).toEqual([expect.objectContaining({ jsiiCode: 5021 })]);
  });
});

describe('JSII5020 language-compatibility/static-member-name-conflicts-with-nested-type', () => {
  // @TODO(ts7): JSII5020 (_staticMembersAndNestedTypesMustNotSharePascalCaseName) is not ported yet
  test.skip('is reported for an enum member and a type nested in the enum', () => {
    const diagnostics = validate(
      assemblyWith({
        'testpkg.Enum': {
          assembly: 'testpkg',
          fqn: 'testpkg.Enum',
          kind: spec.TypeKind.Enum,
          name: 'Enum',
          members: [{ name: 'A' }, { name: 'B' }],
        },
        'testpkg.Enum.A': klass('A', { fqn: 'testpkg.Enum.A', namespace: 'Enum' }),
      }),
    );

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        jsiiCode: 5020,
        messageText:
          'The static member "Enum.A" has the same PascalCased representation as nested type "Enum.A". This would result in invalid code in Go.',
      }),
    );
  });
});

function validate(assembly: spec.Assembly, dependencyClosure: spec.Assembly[] = []): JsiiDiagnostic[] {
  // The validator only reads the dependency closure from the project info.
  const projectInfo = { dependencyClosure } as unknown as ProjectInfo;
  return new Validator(projectInfo, assembly).emit().diagnostics.filter(JsiiDiagnostic.isJsiiDiagnostic);
}

function assemblyWith(types: spec.Assembly['types']): spec.Assembly {
  return dependency('testpkg', types);
}

function dependency(name: string, types: spec.Assembly['types']): spec.Assembly {
  return {
    schema: spec.SchemaVersion.LATEST,
    name,
    version: '0.0.1',
    license: 'Apache-2.0',
    author: { name: 'John Doe', roles: ['author'] },
    description: name,
    homepage: 'https://github.com/aws/jsii-compiler',
    repository: { type: 'git', url: 'https://github.com/aws/jsii-compiler.git' },
    jsiiVersion: '0.0.0',
    fingerprint: '<TBD>',
    types,
  };
}

function klass(name: string, props: Partial<spec.ClassType> = {}): spec.ClassType {
  return {
    assembly: 'testpkg',
    fqn: `testpkg.${name}`,
    kind: spec.TypeKind.Class,
    name,
    ...props,
  };
}
