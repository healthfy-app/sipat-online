FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /source

COPY Directory.Build.props Directory.Packages.props global.json ./
COPY src/Api/SipatOnline.Api/SipatOnline.Api.csproj src/Api/SipatOnline.Api/
COPY src/BuildingBlocks/Application/SipatOnline.BuildingBlocks.Application/SipatOnline.BuildingBlocks.Application.csproj src/BuildingBlocks/Application/SipatOnline.BuildingBlocks.Application/
COPY src/BuildingBlocks/Domain/SipatOnline.BuildingBlocks.Domain/SipatOnline.BuildingBlocks.Domain.csproj src/BuildingBlocks/Domain/SipatOnline.BuildingBlocks.Domain/
COPY src/Modules/Identity/Application/SipatOnline.Identity.Application/SipatOnline.Identity.Application.csproj src/Modules/Identity/Application/SipatOnline.Identity.Application/
COPY src/Modules/Identity/Domain/SipatOnline.Identity.Domain/SipatOnline.Identity.Domain.csproj src/Modules/Identity/Domain/SipatOnline.Identity.Domain/
COPY src/Infrastructure/SipatOnline.Infrastructure/SipatOnline.Infrastructure.csproj src/Infrastructure/SipatOnline.Infrastructure/
COPY src/Modules/Learning/Application/SipatOnline.Learning.Application/SipatOnline.Learning.Application.csproj src/Modules/Learning/Application/SipatOnline.Learning.Application/
COPY src/Modules/Learning/Domain/SipatOnline.Learning.Domain/SipatOnline.Learning.Domain.csproj src/Modules/Learning/Domain/SipatOnline.Learning.Domain/
COPY src/Modules/Sipats/Application/SipatOnline.Sipats.Application/SipatOnline.Sipats.Application.csproj src/Modules/Sipats/Application/SipatOnline.Sipats.Application/
COPY src/Modules/Sipats/Domain/SipatOnline.Sipats.Domain/SipatOnline.Sipats.Domain.csproj src/Modules/Sipats/Domain/SipatOnline.Sipats.Domain/
COPY src/Modules/Tenancy/Application/SipatOnline.Tenancy.Application/SipatOnline.Tenancy.Application.csproj src/Modules/Tenancy/Application/SipatOnline.Tenancy.Application/
COPY src/Modules/Tenancy/Domain/SipatOnline.Tenancy.Domain/SipatOnline.Tenancy.Domain.csproj src/Modules/Tenancy/Domain/SipatOnline.Tenancy.Domain/
RUN dotnet restore src/Api/SipatOnline.Api/SipatOnline.Api.csproj
COPY src/ src/
RUN dotnet publish src/Api/SipatOnline.Api/SipatOnline.Api.csproj \
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
