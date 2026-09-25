[Skip to main content](#content)

[Runtime](/runtime/)[API reference](/api/)[Examples](/examples/)[Deno Deploy](/deploy/)

`⌘K`

`↑↓Up or down to`navigate`↵Enter to`select`ESCEscape to`close

![](/img/light.svg)![](/img/dark.svg)Toggle ThemeToggle navigation menu

## [Deno APIs](/api/deno/)

* [Bundler](/api/deno/bundler)
* [Cloud](/api/deno/cloud)
* [Errors](/api/deno/errors)
* [Fetch](/api/deno/fetch)
* [FFI](/api/deno/ffi)
* [File System](/api/deno/file-system)
* [GPU](/api/deno/gpu)
* [HTTP Server](/api/deno/http-server)
* [I/O](/api/deno/io)
* [Jupyter](/api/deno/jupyter)
* [Linter](/api/deno/linter)
* [Network](/api/deno/network)
* [Permissions](/api/deno/permissions)
* [Runtime](/api/deno/runtime)
* [Subprocess](/api/deno/subprocess)
* [Telemetry](/api/deno/telemetry)
* [Testing](/api/deno/testing)
* [WebSockets](/api/deno/websockets)
* [About](/api/deno/about/)
* [All Deno symbols](/api/deno/all_symbols)

## [Web APIs](/api/web/)

* [Cache](/api/web/cache)
* [Canvas](/api/web/canvas)
* [Crypto](/api/web/crypto)
* [Encoding](/api/web/encoding)
* [Events](/api/web/events)
* [Fetch](/api/web/fetch)
* [File](/api/web/file)
* [GPU](/api/web/gpu)
* [I/O](/api/web/io)
* [Intl](/api/web/intl)
* [Messaging](/api/web/messaging)
* [Performance](/api/web/performance)
* [Platform](/api/web/platform)
* [Storage](/api/web/storage)
* [Streams](/api/web/streams)
* [URL](/api/web/url)
* [Wasm](/api/web/wasm)
* [WebSockets](/api/web/websockets)
* [Workers](/api/web/workers)
* [About](/api/web/about/)
* [All web symbols](/api/web/all_symbols)

## [Node APIs](/api/node/)

* [assert](/api/node/assert/)
* [async\_hooks](/api/node/async_hooks/)
* [buffer](/api/node/buffer/)
* [child\_process](/api/node/child_process/)
* [cluster](/api/node/cluster/)
* [console](/api/node/console/)
* [constants](/api/node/constants/)
* [crypto](/api/node/crypto/)
* [dgram](/api/node/dgram/)
* [diagnostics\_channel](/api/node/diagnostics_channel/)
* [dns](/api/node/dns/)
* [dns/promises](/api/node/dns/promises/)
* [domain](/api/node/domain/)
* [events](/api/node/events/)
* [fs](/api/node/fs/)
* [fs/promises](/api/node/fs/promises/)
* [http](/api/node/http/)
* [http2](/api/node/http2/)
* [https](/api/node/https/)
* [inspector](/api/node/inspector/)
* [inspector/promises](/api/node/inspector/promises/)
* [module](/api/node/module/)
* [net](/api/node/net/)
* [os](/api/node/os/)
* [path](/api/node/path/)
* [perf\_hooks](/api/node/perf_hooks/)
* [process](/api/node/process/)
* [punycode](/api/node/punycode/)
* [querystring](/api/node/querystring/)
* [readline](/api/node/readline/)
* [readline/promises](/api/node/readline/promises/)
* [repl](/api/node/repl/)
* [sea](/api/node/sea/)
* [sqlite](/api/node/sqlite/)
* [stream](/api/node/stream/)
* [stream/consumers](/api/node/stream/consumers/)
* [stream/promises](/api/node/stream/promises/)
* [stream/web](/api/node/stream/web/)
* [string\_decoder](/api/node/string_decoder/)
* [test](/api/node/test/)
* [test/reporters](/api/node/test/reporters/)
* [timers](/api/node/timers/)
* [timers/promises](/api/node/timers/promises/)
* [tls](/api/node/tls/)
* [trace\_events](/api/node/trace_events/)
* [tty](/api/node/tty/)
* [url](/api/node/url/)
* [util](/api/node/util/)
* [util/types](/api/node/util/types/)
* [v8](/api/node/v8/)
* [vm](/api/node/vm/)
* [wasi](/api/node/wasi/)
* [worker\_threads](/api/node/worker_threads/)
* [zlib](/api/node/zlib/)
* [About](/api/node/about/)
* [All node symbols](/api/node/all_symbols)

* [Node](../)
* sqlite

# sqlite

Deno compatibility

This module has been added in Deno v2.2.

The `node:sqlite` module facilitates working with SQLite databases.
To access it:

```
import sqlite from 'node:sqlite';
```

This module is only available under the `node:` scheme. The following will not
work:

```
import sqlite from 'sqlite';
```

The following example shows the basic usage of the `node:sqlite` module to open
an in-memory database, write data to the database, and then read the data back.

```
import { DatabaseSync } from 'node:sqlite';
const database = new DatabaseSync(':memory:');

// Execute SQL statements from strings.
database.exec(`
  CREATE TABLE data(
    key INTEGER PRIMARY KEY,
    value TEXT
  ) STRICT
`);
// Create a prepared statement to insert data into the database.
const insert = database.prepare('INSERT INTO data (key, value) VALUES (?, ?)');
// Execute the prepared statement with bound values.
insert.run(1, 'hello');
insert.run(2, 'world');
// Create a prepared statement to read data from the database.
const query = database.prepare('SELECT * FROM data ORDER BY key');
// Execute the prepared statement and log the result set.
console.log(query.all());
// Prints: [ { key: 1, value: 'hello' }, { key: 2, value: 'world' } ]
```

### Usage in Deno

```
import * as mod from "node:sqlite";
```

## Classes

c

[DatabaseSync](/api/node/sqlite/#DatabaseSync "DatabaseSync")

This class represents a single [connection](https://www.sqlite.org/c3ref/sqlite3.html) to a SQLite database. All APIs
exposed by this class execute synchronously.

* [applyChangeset](/api/node/sqlite/#DatabaseSync.method_applychangeset_0)
* [close](/api/node/sqlite/#DatabaseSync.method_close_0)
* [createSession](/api/node/sqlite/#DatabaseSync.method_createsession_0)
* [enableLoadExtension](/api/node/sqlite/#DatabaseSync.method_enableloadextension_0)
* [exec](/api/node/sqlite/#DatabaseSync.method_exec_0)
* [function](/api/node/sqlite/#DatabaseSync.method_function_0)
* [loadExtension](/api/node/sqlite/#DatabaseSync.method_loadextension_0)
* [open](/api/node/sqlite/#DatabaseSync.method_open_0)
* [prepare](/api/node/sqlite/#DatabaseSync.method_prepare_0)

c

[StatementSync](/api/node/sqlite/#StatementSync "StatementSync")

This class represents a single [prepared statement](https://www.sqlite.org/c3ref/stmt.html). This class cannot be
instantiated via its constructor. Instead, instances are created via the`database.prepare()` method. All APIs exposed by this class execute
synchronously.

* [all](/api/node/sqlite/#StatementSync.method_all_0)
* [expandedSQL](/api/node/sqlite/#StatementSync.property_expandedsql)
* [get](/api/node/sqlite/#StatementSync.method_get_0)
* [iterate](/api/node/sqlite/#StatementSync.method_iterate_0)
* [run](/api/node/sqlite/#StatementSync.method_run_0)
* [setAllowBareNamedParameters](/api/node/sqlite/#StatementSync.method_setallowbarenamedparameters_0)
* [setReadBigInts](/api/node/sqlite/#StatementSync.method_setreadbigints_0)
* [sourceSQL](/api/node/sqlite/#StatementSync.property_sourcesql)

## Interfaces

I

[ApplyChangesetOptions](/api/node/sqlite/#ApplyChangesetOptions "ApplyChangesetOptions")

No documentation available

* [filter](/api/node/sqlite/#ApplyChangesetOptions.property_filter)
* [onConflict](/api/node/sqlite/#ApplyChangesetOptions.property_onconflict)

I

[CreateSessionOptions](/api/node/sqlite/#CreateSessionOptions "CreateSessionOptions")

No documentation available

* [db](/api/node/sqlite/#CreateSessionOptions.property_db)
* [table](/api/node/sqlite/#CreateSessionOptions.property_table)

I

[DatabaseSyncOptions](/api/node/sqlite/#DatabaseSyncOptions "DatabaseSyncOptions")

No documentation available

* [allowExtension](/api/node/sqlite/#DatabaseSyncOptions.property_allowextension)
* [enableDoubleQuotedStringLiterals](/api/node/sqlite/#DatabaseSyncOptions.property_enabledoublequotedstringliterals)
* [enableForeignKeyConstraints](/api/node/sqlite/#DatabaseSyncOptions.property_enableforeignkeyconstraints)
* [open](/api/node/sqlite/#DatabaseSyncOptions.property_open)
* [readOnly](/api/node/sqlite/#DatabaseSyncOptions.property_readonly)

I

[FunctionOptions](/api/node/sqlite/#FunctionOptions "FunctionOptions")

No documentation available

* [deterministic](/api/node/sqlite/#FunctionOptions.property_deterministic)
* [directOnly](/api/node/sqlite/#FunctionOptions.property_directonly)
* [useBigIntArguments](/api/node/sqlite/#FunctionOptions.property_usebigintarguments)
* [varargs](/api/node/sqlite/#FunctionOptions.property_varargs)

I

[Session](/api/node/sqlite/#Session "Session")

No documentation available

* [changeset](/api/node/sqlite/#Session.method_changeset_0)
* [close](/api/node/sqlite/#Session.method_close_0)
* [patchset](/api/node/sqlite/#Session.method_patchset_0)

I

[StatementResultingChanges](/api/node/sqlite/#StatementResultingChanges "StatementResultingChanges")

No documentation available

* [changes](/api/node/sqlite/#StatementResultingChanges.property_changes)
* [lastInsertRowid](/api/node/sqlite/#StatementResultingChanges.property_lastinsertrowid)

## Namespaces

N

[constants](/api/node/sqlite/#constants "constants")

No documentation available

## Type Aliases

T

[SQLInputValue](/api/node/sqlite/#SQLInputValue "SQLInputValue")

No documentation available

T

[SQLOutputValue](/api/node/sqlite/#SQLOutputValue "SQLOutputValue")

No documentation available

T

[SupportedValueType](/api/node/sqlite/#SupportedValueType "SupportedValueType")

No documentation available

## Variables

v

[constants.SQLITE\_CHANGESET\_ABORT](/api/node/sqlite/#constants.SQLITE_CHANGESET_ABORT "constants.SQLITE_CHANGESET_ABORT")

Abort when a change encounters a conflict and roll back database.

v

[constants.SQLITE\_CHANGESET\_CONFLICT](/api/node/sqlite/#constants.SQLITE_CHANGESET_CONFLICT "constants.SQLITE_CHANGESET_CONFLICT")

This constant is passed to the conflict handler while processing an INSERT change if the operation would result in duplicate primary key values.

v

[constants.SQLITE\_CHANGESET\_DATA](/api/node/sqlite/#constants.SQLITE_CHANGESET_DATA "constants.SQLITE_CHANGESET_DATA")

The conflict handler is invoked with this constant when processing a DELETE or UPDATE change if a row with the required PRIMARY KEY fields is present in the database, but one or more other (non primary-key) fields modified by the update do not contain the expected "before" values.

v

[constants.SQLITE\_CHANGESET\_FOREIGN\_KEY](/api/node/sqlite/#constants.SQLITE_CHANGESET_FOREIGN_KEY "constants.SQLITE_CHANGESET_FOREIGN_KEY")

If foreign key handling is enabled, and applying a changeset leaves the database in a state containing foreign key violations, the conflict handler is invoked with this constant exactly once before the changeset is committed. If the conflict handler returns `SQLITE_CHANGESET_OMIT`, the changes, including those that caused the foreign key constraint violation, are committed. Or, if it returns `SQLITE_CHANGESET_ABORT`, the changeset is rolled back.

v

[constants.SQLITE\_CHANGESET\_NOTFOUND](/api/node/sqlite/#constants.SQLITE_CHANGESET_NOTFOUND "constants.SQLITE_CHANGESET_NOTFOUND")

The conflict handler is invoked with this constant when processing a DELETE or UPDATE change if a row with the required PRIMARY KEY fields is not present in the database.

v

[constants.SQLITE\_CHANGESET\_OMIT](/api/node/sqlite/#constants.SQLITE_CHANGESET_OMIT "constants.SQLITE_CHANGESET_OMIT")

Conflicting changes are omitted.

v

[constants.SQLITE\_CHANGESET\_REPLACE](/api/node/sqlite/#constants.SQLITE_CHANGESET_REPLACE "constants.SQLITE_CHANGESET_REPLACE")

Conflicting changes replace existing values. Note that this value can only be returned when the type of conflict is either `SQLITE_CHANGESET_DATA` or `SQLITE_CHANGESET_CONFLICT`.

---

## class [DatabaseSync](#DatabaseSync)

### Usage in Deno

```
import { DatabaseSync } from "node:sqlite";
```

This class represents a single [connection](https://www.sqlite.org/c3ref/sqlite3.html) to a SQLite database. All APIs
exposed by this class execute synchronously.

### Constructors [#](#DatabaseSync.constructors)

`[#](#DatabaseSync.constructor_0)DatabaseSync(

location: string,

options?: [DatabaseSyncOptions](/api/node/sqlite/#DatabaseSyncOptions),

)`

new

Constructs a new `DatabaseSync` instance.

### Methods [#](#DatabaseSync.methods)

`[#](#DatabaseSync.method_applychangeset_0)[applyChangeset](/api/node/sqlite/#DatabaseSync)(

changeset: Uint8Array,

options?: [ApplyChangesetOptions](/api/node/sqlite/#ApplyChangesetOptions),

): boolean`

An exception is thrown if the database is not
open. This method is a wrapper around
[`sqlite3changeset_apply()`](https://www.sqlite.org/session/sqlite3changeset_apply.html).

```
const sourceDb = new DatabaseSync(':memory:');
const targetDb = new DatabaseSync(':memory:');

sourceDb.exec('CREATE TABLE data(key INTEGER PRIMARY KEY, value TEXT)');
targetDb.exec('CREATE TABLE data(key INTEGER PRIMARY KEY, value TEXT)');

const session = sourceDb.createSession();

const insert = sourceDb.prepare('INSERT INTO data (key, value) VALUES (?, ?)');
insert.run(1, 'hello');
insert.run(2, 'world');

const changeset = session.changeset();
targetDb.applyChangeset(changeset);
// Now that the changeset has been applied, targetDb contains the same data as sourceDb.
```

`[#](#DatabaseSync.method_close_0)[close](/api/node/sqlite/#DatabaseSync)(): void`

Closes the database connection. An exception is thrown if the database is not
open. This method is a wrapper around [`sqlite3_close_v2()`](https://www.sqlite.org/c3ref/close.html).

`[#](#DatabaseSync.method_createsession_0)[createSession](/api/node/sqlite/#DatabaseSync)(options?: [CreateSessionOptions](/api/node/sqlite/#CreateSessionOptions)): [Session](/api/node/sqlite/#Session)`

Creates and attaches a session to the database. This method is a wrapper around
[`sqlite3session_create()`](https://www.sqlite.org/session/sqlite3session_create.html) and
[`sqlite3session_attach()`](https://www.sqlite.org/session/sqlite3session_attach.html).

`[#](#DatabaseSync.method_enableloadextension_0)[enableLoadExtension](/api/node/sqlite/#DatabaseSync)(allow: boolean): void`

Enables or disables the `loadExtension` SQL function, and the `loadExtension()`
method. When `allowExtension` is `false` when constructing, you cannot enable
loading extensions for security reasons.

`[#](#DatabaseSync.method_exec_0)[exec](/api/node/sqlite/#DatabaseSync)(sql: string): void`

This method allows one or more SQL statements to be executed without returning
any results. This method is useful when executing SQL statements read from a
file. This method is a wrapper around [`sqlite3_exec()`](https://www.sqlite.org/c3ref/exec.html).

`[#](#DatabaseSync.method_function_0)[function](/api/node/sqlite/#DatabaseSync)(

name: string,

options: [FunctionOptions](/api/node/sqlite/#FunctionOptions),

func: (...args: [SupportedValueType](/api/node/sqlite/#SupportedValueType)[]) => [SupportedValueType](/api/node/sqlite/#SupportedValueType),

): void`

This method is used to create SQLite user-defined functions. This method is a
wrapper around [`sqlite3_create_function_v2()`](https://www.sqlite.org/c3ref/create_function.html).

`[#](#DatabaseSync.method_function_1)[function](/api/node/sqlite/#DatabaseSync)(

name: string,

func: (...args: [SupportedValueType](/api/node/sqlite/#SupportedValueType)[]) => [SupportedValueType](/api/node/sqlite/#SupportedValueType),

): void`

`[#](#DatabaseSync.method_loadextension_0)[loadExtension](/api/node/sqlite/#DatabaseSync)(path: string): void`

Loads a shared library into the database connection. This method is a wrapper
around [`sqlite3_load_extension()`](https://www.sqlite.org/c3ref/load_extension.html). It is required to enable the
`allowExtension` option when constructing the `DatabaseSync` instance.

`[#](#DatabaseSync.method_open_0)[open](/api/node/sqlite/#DatabaseSync)(): void`

Opens the database specified in the `location` argument of the `DatabaseSync`constructor. This method should only be used when the database is not opened via
the constructor. An exception is thrown if the database is already open.

`[#](#DatabaseSync.method_prepare_0)[prepare](/api/node/sqlite/#DatabaseSync)(sql: string): [StatementSync](/api/node/sqlite/#StatementSync)`

Compiles a SQL statement into a [prepared statement](https://www.sqlite.org/c3ref/stmt.html). This method is a wrapper
around [`sqlite3_prepare_v2()`](https://www.sqlite.org/c3ref/prepare.html).

---

## class [StatementSync](#StatementSync)

### Usage in Deno

```
import { StatementSync } from "node:sqlite";
```

This class represents a single [prepared statement](https://www.sqlite.org/c3ref/stmt.html). This class cannot be
instantiated via its constructor. Instead, instances are created via the`database.prepare()` method. All APIs exposed by this class execute
synchronously.

A prepared statement is an efficient binary representation of the SQL used to
create it. Prepared statements are parameterizable, and can be invoked multiple
times with different bound values. Parameters also offer protection against [SQL injection](https://en.wikipedia.org/wiki/SQL_injection) attacks. For these reasons, prepared statements are
preferred
over hand-crafted SQL strings when handling user input.

### Constructors [#](#StatementSync.constructors)

`[#](#StatementSync.constructor_0)StatementSync()`

new

### Properties [#](#StatementSync.properties)

`[#](#StatementSync.property_expandedsql)[expandedSQL](/api/node/sqlite/#StatementSync): string`

readonly

The source SQL text of the prepared statement with parameter
placeholders replaced by the values that were used during the most recent
execution of this prepared statement. This property is a wrapper around
[`sqlite3_expanded_sql()`](https://www.sqlite.org/c3ref/expanded_sql.html).

`[#](#StatementSync.property_sourcesql)[sourceSQL](/api/node/sqlite/#StatementSync): string`

readonly

The source SQL text of the prepared statement. This property is a
wrapper around [`sqlite3_sql()`](https://www.sqlite.org/c3ref/expanded_sql.html).

### Methods [#](#StatementSync.methods)

`[#](#StatementSync.method_all_0)[all](/api/node/sqlite/#StatementSync)(...anonymousParameters: [SQLInputValue](/api/node/sqlite/#SQLInputValue)[]): Record<string, [SQLOutputValue](/api/node/sqlite/#SQLOutputValue)>[]`

This method executes a prepared statement and returns all results as an array of
objects. If the prepared statement does not return any results, this method
returns an empty array. The prepared statement [parameters are bound](https://www.sqlite.org/c3ref/bind_blob.html) using
the values in `namedParameters` and `anonymousParameters`.

`[#](#StatementSync.method_all_1)[all](/api/node/sqlite/#StatementSync)(

namedParameters: Record<string, [SQLInputValue](/api/node/sqlite/#SQLInputValue)>,

...anonymousParameters: [SQLInputValue](/api/node/sqlite/#SQLInputValue)[],

): Record<string, [SQLOutputValue](/api/node/sqlite/#SQLOutputValue)>[]`

`[#](#StatementSync.method_get_0)[get](/api/node/sqlite/#StatementSync)(...anonymousParameters: [SQLInputValue](/api/node/sqlite/#SQLInputValue)[]): Record<string, [SQLOutputValue](/api/node/sqlite/#SQLOutputValue)> | undefined`

This method executes a prepared statement and returns the first result as an
object. If the prepared statement does not return any results, this method
returns `undefined`. The prepared statement [parameters are bound](https://www.sqlite.org/c3ref/bind_blob.html) using the
values in `namedParameters` and `anonymousParameters`.

`[#](#StatementSync.method_get_1)[get](/api/node/sqlite/#StatementSync)(

namedParameters: Record<string, [SQLInputValue](/api/node/sqlite/#SQLInputValue)>,

...anonymousParameters: [SQLInputValue](/api/node/sqlite/#SQLInputValue)[],

): Record<string, [SQLOutputValue](/api/node/sqlite/#SQLOutputValue)> | undefined`

`[#](#StatementSync.method_iterate_0)[iterate](/api/node/sqlite/#StatementSync)(...anonymousParameters: [SQLInputValue](/api/node/sqlite/#SQLInputValue)[]): Iterator<Record<string, [SQLOutputValue](/api/node/sqlite/#SQLOutputValue)>>`

This method executes a prepared statement and returns an iterator of
objects. If the prepared statement does not return any results, this method
returns an empty iterator. The prepared statement [parameters are bound](https://www.sqlite.org/c3ref/bind_blob.html) using
the values in `namedParameters` and `anonymousParameters`.

`[#](#StatementSync.method_iterate_1)[iterate](/api/node/sqlite/#StatementSync)(

namedParameters: Record<string, [SQLInputValue](/api/node/sqlite/#SQLInputValue)>,

...anonymousParameters: [SQLInputValue](/api/node/sqlite/#SQLInputValue)[],

): Iterator<Record<string, [SQLOutputValue](/api/node/sqlite/#SQLOutputValue)>>`

`[#](#StatementSync.method_run_0)[run](/api/node/sqlite/#StatementSync)(...anonymousParameters: [SQLInputValue](/api/node/sqlite/#SQLInputValue)[]): [StatementResultingChanges](/api/node/sqlite/#StatementResultingChanges)`

This method executes a prepared statement and returns an object summarizing the
resulting changes. The prepared statement [parameters are bound](https://www.sqlite.org/c3ref/bind_blob.html) using the
values in `namedParameters` and `anonymousParameters`.

`[#](#StatementSync.method_run_1)[run](/api/node/sqlite/#StatementSync)(

namedParameters: Record<string, [SQLInputValue](/api/node/sqlite/#SQLInputValue)>,

...anonymousParameters: [SQLInputValue](/api/node/sqlite/#SQLInputValue)[],

): [StatementResultingChanges](/api/node/sqlite/#StatementResultingChanges)`

`[#](#StatementSync.method_setallowbarenamedparameters_0)[setAllowBareNamedParameters](/api/node/sqlite/#StatementSync)(enabled: boolean): void`

The names of SQLite parameters begin with a prefix character. By default,`node:sqlite` requires that this prefix character is present when binding
parameters. However, with the exception of dollar sign character, these
prefix characters also require extra quoting when used in object keys.

To improve ergonomics, this method can be used to also allow bare named
parameters, which do not require the prefix character in JavaScript code. There
are several caveats to be aware of when enabling bare named parameters:

* The prefix character is still required in SQL.
* The prefix character is still allowed in JavaScript. In fact, prefixed names
  will have slightly better binding performance.
* Using ambiguous named parameters, such as `$k` and `@k`, in the same prepared
  statement will result in an exception as it cannot be determined how to bind
  a bare name.

`[#](#StatementSync.method_setreadbigints_0)[setReadBigInts](/api/node/sqlite/#StatementSync)(enabled: boolean): void`

When reading from the database, SQLite `INTEGER`s are mapped to JavaScript
numbers by default. However, SQLite `INTEGER`s can store values larger than
JavaScript numbers are capable of representing. In such cases, this method can
be used to read `INTEGER` data using JavaScript `BigInt`s. This method has no
impact on database write operations where numbers and `BigInt`s are both
supported at all times.

---

## interface [ApplyChangesetOptions](#ApplyChangesetOptions)

### Usage in Deno

```
import { type ApplyChangesetOptions } from "node:sqlite";
```

### Properties [#](#ApplyChangesetOptions.properties)

`[#](#ApplyChangesetOptions.property_filter)[filter](/api/node/sqlite/#ApplyChangesetOptions): ((tableName: string) => boolean) | undefined`

optional

Skip changes that, when targeted table name is supplied to this function, return a truthy value.
By default, all changes are attempted.

`[#](#ApplyChangesetOptions.property_onconflict)[onConflict](/api/node/sqlite/#ApplyChangesetOptions): ((conflictType: number) => number) | undefined`

optional

A function that determines how to handle conflicts. The function receives one argument,
which can be one of the following values:

* `SQLITE_CHANGESET_DATA`: A `DELETE` or `UPDATE` change does not contain the expected "before" values.
* `SQLITE_CHANGESET_NOTFOUND`: A row matching the primary key of the `DELETE` or `UPDATE` change does not exist.
* `SQLITE_CHANGESET_CONFLICT`: An `INSERT` change results in a duplicate primary key.
* `SQLITE_CHANGESET_FOREIGN_KEY`: Applying a change would result in a foreign key violation.
* `SQLITE_CHANGESET_CONSTRAINT`: Applying a change results in a `UNIQUE`, `CHECK`, or `NOT NULL` constraint
  violation.

The function should return one of the following values:

* `SQLITE_CHANGESET_OMIT`: Omit conflicting changes.
* `SQLITE_CHANGESET_REPLACE`: Replace existing values with conflicting changes (only valid with
  `SQLITE_CHANGESET_DATA` or `SQLITE_CHANGESET_CONFLICT` conflicts).
* `SQLITE_CHANGESET_ABORT`: Abort on conflict and roll back the database.

When an error is thrown in the conflict handler or when any other value is returned from the handler,
applying the changeset is aborted and the database is rolled back.

**Default**: A function that returns `SQLITE_CHANGESET_ABORT`.

---

## interface [CreateSessionOptions](#CreateSessionOptions)

### Usage in Deno

```
import { type CreateSessionOptions } from "node:sqlite";
```

### Properties [#](#CreateSessionOptions.properties)

`[#](#CreateSessionOptions.property_table)[table](/api/node/sqlite/#CreateSessionOptions): string | undefined`

optional

A specific table to track changes for. By default, changes to all tables are tracked.

`[#](#CreateSessionOptions.property_db)[db](/api/node/sqlite/#CreateSessionOptions): string | undefined`

optional

Name of the database to track. This is useful when multiple databases have been added using
[`ATTACH DATABASE`](https://www.sqlite.org/lang_attach.html).

---

## interface [DatabaseSyncOptions](#DatabaseSyncOptions)

### Usage in Deno

```
import { type DatabaseSyncOptions } from "node:sqlite";
```

### Properties [#](#DatabaseSyncOptions.properties)

`[#](#DatabaseSyncOptions.property_open)[open](/api/node/sqlite/#DatabaseSyncOptions): boolean | undefined`

optional

If `true`, the database is opened by the constructor. When
this value is `false`, the database must be opened via the `open()` method.

`[#](#DatabaseSyncOptions.property_enableforeignkeyconstraints)[enableForeignKeyConstraints](/api/node/sqlite/#DatabaseSyncOptions): boolean | undefined`

optional

If `true`, foreign key constraints
are enabled. This is recommended but can be disabled for compatibility with
legacy database schemas. The enforcement of foreign key constraints can be
enabled and disabled after opening the database using
[`PRAGMA foreign_keys`](https://www.sqlite.org/pragma.html#pragma_foreign_keys).

`[#](#DatabaseSyncOptions.property_enabledoublequotedstringliterals)[enableDoubleQuotedStringLiterals](/api/node/sqlite/#DatabaseSyncOptions): boolean | undefined`

optional

If `true`, SQLite will accept
[double-quoted string literals](https://www.sqlite.org/quirks.html#dblquote).
This is not recommended but can be
enabled for compatibility with legacy database schemas.

`[#](#DatabaseSyncOptions.property_readonly)[readOnly](/api/node/sqlite/#DatabaseSyncOptions): boolean | undefined`

optional

If `true`, the database is opened in read-only mode.
If the database does not exist, opening it will fail.

`[#](#DatabaseSyncOptions.property_allowextension)[allowExtension](/api/node/sqlite/#DatabaseSyncOptions): boolean | undefined`

optional

If `true`, the `loadExtension` SQL function
and the `loadExtension()` method are enabled.
You can call `enableLoadExtension(false)` later to disable this feature.

---

## interface [FunctionOptions](#FunctionOptions)

### Usage in Deno

```
import { type FunctionOptions } from "node:sqlite";
```

### Properties [#](#FunctionOptions.properties)

`[#](#FunctionOptions.property_deterministic)[deterministic](/api/node/sqlite/#FunctionOptions): boolean | undefined`

optional

If `true`, the [`SQLITE_DETERMINISTIC`](https://www.sqlite.org/c3ref/c_deterministic.html) flag is
set on the created function.

`[#](#FunctionOptions.property_directonly)[directOnly](/api/node/sqlite/#FunctionOptions): boolean | undefined`

optional

If `true`, the [`SQLITE_DIRECTONLY`](https://www.sqlite.org/c3ref/c_directonly.html) flag is set on
the created function.

`[#](#FunctionOptions.property_usebigintarguments)[useBigIntArguments](/api/node/sqlite/#FunctionOptions): boolean | undefined`

optional

If `true`, integer arguments to `function`
are converted to `BigInt`s. If `false`, integer arguments are passed as
JavaScript numbers.

`[#](#FunctionOptions.property_varargs)[varargs](/api/node/sqlite/#FunctionOptions): boolean | undefined`

optional

If `true`, `function` can accept a variable number of
arguments. If `false`, `function` must be invoked with exactly
`function.length` arguments.

---

## interface [Session](#Session)

### Usage in Deno

```
import { type Session } from "node:sqlite";
```

### Methods [#](#Session.methods)

`[#](#Session.method_changeset_0)[changeset](/api/node/sqlite/#Session)(): Uint8Array`

Retrieves a changeset containing all changes since the changeset was created. Can be called multiple times.
An exception is thrown if the database or the session is not open. This method is a wrapper around
[`sqlite3session_changeset()`](https://www.sqlite.org/session/sqlite3session_changeset.html).

`[#](#Session.method_patchset_1)[patchset](/api/node/sqlite/#Session)(): Uint8Array`

Similar to the method above, but generates a more compact patchset. See
[Changesets and Patchsets](https://www.sqlite.org/sessionintro.html#changesets_and_patchsets)
in the documentation of SQLite. An exception is thrown if the database or the session is not open. This method is a
wrapper around
[`sqlite3session_patchset()`](https://www.sqlite.org/session/sqlite3session_patchset.html).

`[#](#Session.method_close_2)[close](/api/node/sqlite/#Session)(): void`

Closes the session. An exception is thrown if the database or the session is not open. This method is a
wrapper around
[`sqlite3session_delete()`](https://www.sqlite.org/session/sqlite3session_delete.html).

---

## interface [StatementResultingChanges](#StatementResultingChanges)

### Usage in Deno

```
import { type StatementResultingChanges } from "node:sqlite";
```

### Properties [#](#StatementResultingChanges.properties)

`[#](#StatementResultingChanges.property_changes)[changes](/api/node/sqlite/#StatementResultingChanges): number | bigint`

The number of rows modified, inserted, or deleted by the most recently completed `INSERT`, `UPDATE`, or `DELETE` statement.
This field is either a number or a `BigInt` depending on the prepared statement's configuration.
This property is the result of [`sqlite3_changes64()`](https://www.sqlite.org/c3ref/changes.html).

`[#](#StatementResultingChanges.property_lastinsertrowid)[lastInsertRowid](/api/node/sqlite/#StatementResultingChanges): number | bigint`

The most recently inserted rowid.
This field is either a number or a `BigInt` depending on the prepared statement's configuration.
This property is the result of [`sqlite3_last_insert_rowid()`](https://www.sqlite.org/c3ref/last_insert_rowid.html).

---

## namespace [constants](#constants)

### Usage in Deno

```
import { constants } from "node:sqlite";
```

### Variables [#](#constants.Variables)

v

[constants.SQLITE\_CHANGESET\_ABORT](/api/node/sqlite/#constants.SQLITE_CHANGESET_ABORT "constants.SQLITE_CHANGESET_ABORT")

Abort when a change encounters a conflict and roll back database.

v

[constants.SQLITE\_CHANGESET\_CONFLICT](/api/node/sqlite/#constants.SQLITE_CHANGESET_CONFLICT "constants.SQLITE_CHANGESET_CONFLICT")

This constant is passed to the conflict handler while processing an INSERT change if the operation would result in duplicate primary key values.

v

[constants.SQLITE\_CHANGESET\_DATA](/api/node/sqlite/#constants.SQLITE_CHANGESET_DATA "constants.SQLITE_CHANGESET_DATA")

The conflict handler is invoked with this constant when processing a DELETE or UPDATE change if a row with the required PRIMARY KEY fields is present in the database, but one or more other (non primary-key) fields modified by the update do not contain the expected "before" values.

v

[constants.SQLITE\_CHANGESET\_FOREIGN\_KEY](/api/node/sqlite/#constants.SQLITE_CHANGESET_FOREIGN_KEY "constants.SQLITE_CHANGESET_FOREIGN_KEY")

If foreign key handling is enabled, and applying a changeset leaves the database in a state containing foreign key violations, the conflict handler is invoked with this constant exactly once before the changeset is committed. If the conflict handler returns `SQLITE_CHANGESET_OMIT`, the changes, including those that caused the foreign key constraint violation, are committed. Or, if it returns `SQLITE_CHANGESET_ABORT`, the changeset is rolled back.

v

[constants.SQLITE\_CHANGESET\_NOTFOUND](/api/node/sqlite/#constants.SQLITE_CHANGESET_NOTFOUND "constants.SQLITE_CHANGESET_NOTFOUND")

The conflict handler is invoked with this constant when processing a DELETE or UPDATE change if a row with the required PRIMARY KEY fields is not present in the database.

v

[constants.SQLITE\_CHANGESET\_OMIT](/api/node/sqlite/#constants.SQLITE_CHANGESET_OMIT "constants.SQLITE_CHANGESET_OMIT")

Conflicting changes are omitted.

v

[constants.SQLITE\_CHANGESET\_REPLACE](/api/node/sqlite/#constants.SQLITE_CHANGESET_REPLACE "constants.SQLITE_CHANGESET_REPLACE")

Conflicting changes replace existing values. Note that this value can only be returned when the type of conflict is either `SQLITE_CHANGESET_DATA` or `SQLITE_CHANGESET_CONFLICT`.

---

## type alias [SQLInputValue](#SQLInputValue)

unstable

### Usage in Deno

```
import { type SQLInputValue } from "node:sqlite";
```

Deno compatibility

This module has been added in Deno v2.2.

The `node:sqlite` module facilitates working with SQLite databases.
To access it:

```
import sqlite from 'node:sqlite';
```

This module is only available under the `node:` scheme. The following will not
work:

```
import sqlite from 'sqlite';
```

The following example shows the basic usage of the `node:sqlite` module to open
an in-memory database, write data to the database, and then read the data back.

```
import { DatabaseSync } from 'node:sqlite';
const database = new DatabaseSync(':memory:');

// Execute SQL statements from strings.
database.exec(`
  CREATE TABLE data(
    key INTEGER PRIMARY KEY,
    value TEXT
  ) STRICT
`);
// Create a prepared statement to insert data into the database.
const insert = database.prepare('INSERT INTO data (key, value) VALUES (?, ?)');
// Execute the prepared statement with bound values.
insert.run(1, 'hello');
insert.run(2, 'world');
// Create a prepared statement to read data from the database.
const query = database.prepare('SELECT * FROM data ORDER BY key');
// Execute the prepared statement and log the result set.
console.log(query.all());
// Prints: [ { key: 1, value: 'hello' }, { key: 2, value: 'world' } ]
```

### Definition [#](#SQLInputValue.definition)

`null
 | number
 | bigint
 | string
 | ArrayBufferView`

### See [#](#SQLInputValue.see)

* [source](https://github.com/nodejs/node/blob/v22.x/lib/sqlite.js)

---

## type alias [SQLOutputValue](#SQLOutputValue)

### Usage in Deno

```
import { type SQLOutputValue } from "node:sqlite";
```

### Definition [#](#SQLOutputValue.definition)

`null
 | number
 | bigint
 | string
 | Uint8Array`

---

## type alias [SupportedValueType](#SupportedValueType)

### Usage in Deno

```
import { type SupportedValueType } from "node:sqlite";
```

Deprecated

Use `SQLInputValue` or `SQLOutputValue` instead.

### Definition [#](#SupportedValueType.definition)

`[SQLOutputValue](/api/node/sqlite/#SQLOutputValue)`

---

## variable [constants.SQLITE\_CHANGESET\_ABORT](#constants.SQLITE_CHANGESET_ABORT)

### Usage in Deno

```
import { constants } from "node:sqlite";
```

Abort when a change encounters a conflict and roll back database.

### Type [#](#constants.SQLITE_CHANGESET_ABORT.type)

`number`

---

## variable [constants.SQLITE\_CHANGESET\_CONFLICT](#constants.SQLITE_CHANGESET_CONFLICT)

### Usage in Deno

```
import { constants } from "node:sqlite";
```

This constant is passed to the conflict handler while processing an INSERT change if the operation would result in duplicate primary key values.

### Type [#](#constants.SQLITE_CHANGESET_CONFLICT.type)

`number`

---

## variable [constants.SQLITE\_CHANGESET\_DATA](#constants.SQLITE_CHANGESET_DATA)

### Usage in Deno

```
import { constants } from "node:sqlite";
```

The conflict handler is invoked with this constant when processing a DELETE or UPDATE change if a row with the required PRIMARY KEY fields is present in the database, but one or more other (non primary-key) fields modified by the update do not contain the expected "before" values.

### Type [#](#constants.SQLITE_CHANGESET_DATA.type)

`number`

---

## variable [constants.SQLITE\_CHANGESET\_FOREIGN\_KEY](#constants.SQLITE_CHANGESET_FOREIGN_KEY)

### Usage in Deno

```
import { constants } from "node:sqlite";
```

If foreign key handling is enabled, and applying a changeset leaves the database in a state containing foreign key violations, the conflict handler is invoked with this constant exactly once before the changeset is committed. If the conflict handler returns `SQLITE_CHANGESET_OMIT`, the changes, including those that caused the foreign key constraint violation, are committed. Or, if it returns `SQLITE_CHANGESET_ABORT`, the changeset is rolled back.

### Type [#](#constants.SQLITE_CHANGESET_FOREIGN_KEY.type)

`number`

---

## variable [constants.SQLITE\_CHANGESET\_NOTFOUND](#constants.SQLITE_CHANGESET_NOTFOUND)

### Usage in Deno

```
import { constants } from "node:sqlite";
```

The conflict handler is invoked with this constant when processing a DELETE or UPDATE change if a row with the required PRIMARY KEY fields is not present in the database.

### Type [#](#constants.SQLITE_CHANGESET_NOTFOUND.type)

`number`

---

## variable [constants.SQLITE\_CHANGESET\_OMIT](#constants.SQLITE_CHANGESET_OMIT)

### Usage in Deno

```
import { constants } from "node:sqlite";
```

Conflicting changes are omitted.

### Type [#](#constants.SQLITE_CHANGESET_OMIT.type)

`number`

---

## variable [constants.SQLITE\_CHANGESET\_REPLACE](#constants.SQLITE_CHANGESET_REPLACE)

### Usage in Deno

```
import { constants } from "node:sqlite";
```

Conflicting changes replace existing values. Note that this value can only be returned when the type of conflict is either `SQLITE_CHANGESET_DATA` or `SQLITE_CHANGESET_CONFLICT`.

### Type [#](#constants.SQLITE_CHANGESET_REPLACE.type)

`number`

---

## Did you find what you needed?

YesNo

What can we do to improve this page?

0 / 2000

GitHub username (*optional*)

If provided, you'll be @mentioned in the created GitHub issue

Send us feedback

[Privacy policy](/deploy/privacy_policy)

* [Classes](#Classes "Classes")

  - [constants.SQLITE\_CHANGESET\_ABORT](#constants.SQLITE_CHANGESET_ABORT "constants.SQLITE_CHANGESET_ABORT")
  - [constants.SQLITE\_CHANGESET\_CONFLICT](#constants.SQLITE_CHANGESET_CONFLICT "constants.SQLITE_CHANGESET_CONFLICT")
  - [constants.SQLITE\_CHANGESET\_DATA](#constants.SQLITE_CHANGESET_DATA "constants.SQLITE_CHANGESET_DATA")
  - [constants.SQLITE\_CHANGESET\_FOREIGN\_KEY](#constants.SQLITE_CHANGESET_FOREIGN_KEY "constants.SQLITE_CHANGESET_FOREIGN_KEY")
  - [constants.SQLITE\_CHANGESET\_NOTFOUND](#constants.SQLITE_CHANGESET_NOTFOUND "constants.SQLITE_CHANGESET_NOTFOUND")
  - [constants.SQLITE\_CHANGESET\_OMIT](#constants.SQLITE_CHANGESET_OMIT "constants.SQLITE_CHANGESET_OMIT")
  - [constants.SQLITE\_CHANGESET\_REPLACE](#constants.SQLITE_CHANGESET_REPLACE "constants.SQLITE_CHANGESET_REPLACE")
* [Interfaces](#Interfaces "Interfaces")
* [Namespaces](#Namespaces "Namespaces")
* [Type Aliases](#Type Aliases "Type Aliases")
* [Variables](#Variables "Variables")

### Deno Docs

* [Deno Runtime](/runtime/)
* [Examples](/examples/)
* [Standard Library](https://jsr.io/%40std)
* [Deno API Reference](/api/deno/)

### Services Docs

* [Deno Deploy](/deploy/)
* [Deno Deploy Classic](/deploy/classic/)
* [Deno Subhosting](/subhosting/manual/)

### Community

* [Discord](https://discord.gg/deno)
* [GitHub](https://github.com/denoland)
* [YouTube](https://youtube.com/%40deno_land)
* [Bluesky](https://bsky.app/profile/deno.land)
* [Mastodon](https://fosstodon.org/%40deno_land)
* [Twitter](https://twitter.com/deno_land)
* [Newsletter](https://deno.news/)

### Help & Feedback

* [Community Support](https://discord.gg/deno)
* [Deploy System Status](https://denostatus.com)
* [Deploy Feedback](https://github.com/denoland/deploy_feedback)
* Report a Problem

### Company

* [Deno Website](https://deno.com/)
* [Blog](https://deno.com/blog)
* [Privacy Policy](/deploy/privacy_policy)
* [LLMs](/llms.txt)

Copyright © 2026 the Deno authors.
