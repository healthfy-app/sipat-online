FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /source

COPY Directory.Build.props Directory.Packages.props global.json ./
COPY src/SipatOnline.Api/SipatOnline.Api.csproj src/SipatOnline.Api/
COPY src/SipatOnline.BuildingBlocks.Application/SipatOnline.BuildingBlocks.Application.csproj src/SipatOnline.BuildingBlocks.Application/
COPY src/SipatOnline.BuildingBlocks.Domain/SipatOnline.BuildingBlocks.Domain.csproj src/SipatOnline.BuildingBlocks.Domain/
COPY src/SipatOnline.Identity.Application/SipatOnline.Identity.Application.csproj src/SipatOnline.Identity.Application/
COPY src/SipatOnline.Identity.Domain/SipatOnline.Identity.Domain.csproj src/SipatOnline.Identity.Domain/
COPY src/SipatOnline.Infrastructure/SipatOnline.Infrastructure.csproj src/SipatOnline.Infrastructure/
COPY src/SipatOnline.Learning.Application/SipatOnline.Learning.Application.csproj src/SipatOnline.Learning.Application/
COPY src/SipatOnline.Learning.Domain/SipatOnline.Learning.Domain.csproj src/SipatOnline.Learning.Domain/
COPY src/SipatOnline.Sipats.Application/SipatOnline.Sipats.Application.csproj src/SipatOnline.Sipats.Application/
COPY src/SipatOnline.Sipats.Domain/SipatOnline.Sipats.Domain.csproj src/SipatOnline.Sipats.Domain/
COPY src/SipatOnline.Tenancy.Application/SipatOnline.Tenancy.Application.csproj src/SipatOnline.Tenancy.Application/
COPY src/SipatOnline.Tenancy.Domain/SipatOnline.Tenancy.Domain.csproj src/SipatOnline.Tenancy.Domain/
RUN dotnet restore src/SipatOnline.Api/SipatOnline.Api.csproj
COPY src/ src/
RUN dotnet publish src/SipatOnline.Api/SipatOnline.Api.csproj \
    --configuration Release \
    --no-restore \
    --output /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl libgssapi-krb5-2 \
    && rm -rf /var/lib/apt/lists/*

ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080

COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "SipatOnline.Api.dll"]
