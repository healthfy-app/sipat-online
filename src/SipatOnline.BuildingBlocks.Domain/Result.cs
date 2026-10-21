namespace SipatOnline.BuildingBlocks.Domain;

public abstract class Result<T>
    where T : notnull
{
    private Result()
    {
    }

    public abstract bool IsSuccess { get; }

    public abstract T Value { get; }

    public abstract DomainError Error { get; }

    public static Result<T> Success(T value)
    {
        ArgumentNullException.ThrowIfNull(value);
        return new SuccessResult(value);
    }

    public static Result<T> Failure(DomainError error)
    {
        ArgumentNullException.ThrowIfNull(error);
        return new FailureResult(error);
    }

    private sealed class SuccessResult(T value) : Result<T>
    {
        public override bool IsSuccess => true;

        public override T Value => value;

        public override DomainError Error =>
            throw new InvalidOperationException("A successful result does not contain an error.");
    }

    private sealed class FailureResult(DomainError error) : Result<T>
    {
        public override bool IsSuccess => false;

        public override T Value =>
            throw new InvalidOperationException("A failed result does not contain a value.");

        public override DomainError Error => error;
    }
}
